import dotenv from "dotenv";
import pg from "pg";
import { MongoClient, BSON } from "mongodb";
import { randomUUID, createHash } from "node:crypto";
import {
  mkdir,
  writeFile,
  readFile,
  cp,
  access,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { ensureOlborsIndexes, EXCHANGES } from "../server/olbors.js";

// No development fallback: imports must always target the configured persistent DB.
dotenv.config({ quiet: true });
const sourceDir = path.resolve(
  process.env.BEER_EXCHANGE_DIR?.trim() || "../Beer-Exchange",
);
let sourceEnv = {};
try {
  sourceEnv = dotenv.parse(await readFile(path.join(sourceDir, ".env")));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const source =
  process.env.BEER_EXCHANGE_DATABASE_URL?.trim() || sourceEnv.DATABASE_URL;
if (!source || !process.env.MONGODB_URI)
  throw new Error("Configure source PostgreSQL and destination MONGODB_URI.");
const apply = process.argv.includes("--apply");
const pool = new pg.Client({
  connectionString: source,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
});
const mongo = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
const backupDir = path.resolve(
  "data",
  "olbors-migration",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
try {
  await pool.connect();
  await pool.query(
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  const tables = (
    await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    )
  ).rows.map((r) => r.table_name);
  const data = {};
  for (const t of tables)
    data[t] = (
      await pool.query(`SELECT * FROM "${t.replaceAll('"', '""')}"`)
    ).rows;
  await pool.query("COMMIT");
  for (const t of [
    "event",
    "customer",
    "event_beer",
    "transaction",
    "price_update",
  ])
    if (!data[t]) throw new Error(`Missing source table ${t}`);
  await mkdir(backupDir, { recursive: true });
  await writeFile(
    path.join(backupDir, "source.json"),
    JSON.stringify(data, null, 2),
  );
  try {
    await access(path.join(sourceDir, "uploads"));
    await cp(path.join(sourceDir, "uploads"), path.join(backupDir, "uploads"), {
      recursive: true,
    });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const referencedMedia = [
    ...new Set(
      ["event", "customer", "event_beer"].flatMap((t) =>
        data[t].flatMap((row) =>
          Object.values(row).filter(
            (v) => typeof v === "string" && v.startsWith("/uploads/"),
          ),
        ),
      ),
    ),
  ];
  const mediaMissing = [];
  for (const url of referencedMedia) {
    const target = path.join(backupDir, "uploads", path.basename(url));
    try {
      await access(target);
      continue;
    } catch {}
    if (!process.env.BEER_EXCHANGE_API_URL) {
      mediaMissing.push(url);
      continue;
    }
    const response = await fetch(
      new URL(url, process.env.BEER_EXCHANGE_API_URL),
      { signal: AbortSignal.timeout(15000) },
    );
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/")
    ) {
      mediaMissing.push(url);
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 20 * 1024 * 1024)
      throw new Error(`Invalid source image ${url}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  await writeFile(
    path.join(backupDir, "missing-media.json"),
    JSON.stringify(mediaMissing, null, 2),
  );
  if (mediaMissing.length && !process.argv.includes("--allow-missing-media"))
    throw new Error(
      `Missing ${mediaMissing.length} uploaded images. Set BEER_EXCHANGE_API_URL to the old backend origin.`,
    );
  await mongo.connect();
  const db = mongo.db(process.env.MONGODB_DB || undefined);
  const users = await db.collection("users").find({}).toArray();
  // Administrator mapping must be reviewed; never grant rights by fuzzy name matches.
  const map = process.env.OLBORS_USER_MAP
    ? JSON.parse(await readFile(process.env.OLBORS_USER_MAP, "utf8"))
    : { admins: {}, customers: {} };
  const missingAdmins = data.event.filter((e) => !map.admins?.[e.id]?.length);
  const counts = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v.length]),
  );
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        counts,
        exchangesWithoutAdminMapping: missingAdmins.map((e) => ({
          id: e.id,
          name: e.name,
        })),
        backupDir,
        missingMedia: mediaMissing,
      },
      null,
      2,
    ),
  );
  if (apply && missingAdmins.length)
    throw new Error(
      "Provide OLBORS_USER_MAP with explicit admins for every exchange before applying. Source backup is saved.",
    );
  const media = (row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        typeof v === "string" && v.startsWith("/uploads/")
          ? mediaMissing.includes(v)
            ? process.env.BEER_EXCHANGE_API_URL
              ? new URL(v, process.env.BEER_EXCHANGE_API_URL).href
              : v
            : `/olbors-media/${path.basename(v)}`
          : v instanceof Date
            ? v.toISOString()
            : v,
      ]),
    );
  const docs = data.event.map((e) => {
    const beers = data.event_beer
      .filter((b) => b.event_id === e.id)
      .map((b) => {
        const r = media(b);
        for (const k of [
          "base_price",
          "min_price",
          "max_price",
          "current_price",
          "abv",
          "ibu",
        ])
          if (r[k] != null) r[k] = Number(r[k]);
        return r;
      });
    const customers = data.customer
      .filter((c) => c.event_id === e.id)
      .map((c) => ({ ...media(c), uid: map.customers?.[c.id] ?? null }));
    const adminUids = map.admins?.[e.id] ?? [];
    for (const uid of [
      ...adminUids,
      ...customers.map((c) => c.uid).filter((v) => v != null),
    ])
      if (!users.some((u) => u.uid === uid))
        throw new Error(`Unknown Gnomguttan uid ${uid}`);
    const linked = customers.map((c) => c.uid).filter((v) => v != null);
    if (new Set(linked).size !== linked.length)
      throw new Error(`Duplicate customer links for ${e.id}`);
    const transactions = data.transaction
      .filter((t) => t.event_id === e.id)
      .map((t) => ({
        ...media(t),
        qty: Number(t.qty),
        volume_ml: Number(t.volume_ml ?? 500),
        unit_price: Number(t.unit_price),
        total_price: Number(t.unit_price),
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const priceUpdates = data.price_update
      .filter((p) => beers.some((b) => b.id === p.event_beer_id))
      .map((p) => ({
        ...media(p),
        old_price: p.old_price == null ? null : Number(p.old_price),
        new_price: Number(p.new_price),
      }))
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    for (const t of transactions)
      if (
        (t.event_beer_id && !beers.some((b) => b.id === t.event_beer_id)) ||
        (t.customer_id && !customers.some((c) => c.id === t.customer_id))
      )
        throw new Error(`Broken reference in ${t.id}`);
    const doc = {
      ...media(e),
      beers,
      customers,
      transactions,
      priceUpdates,
      adminUids,
      creatorUid: adminUids[0] ?? null,
      kioskToken: randomUUID(),
      version: 0,
      migration: {
        source: "beer-exchange",
        importedAt: new Date().toISOString(),
      },
    };
    if (BSON.calculateObjectSize(doc) > 14 * 1024 * 1024)
      throw new Error(`Exchange ${e.id} exceeds atomic document limit.`);
    return doc;
  });
  if (apply) {
    await ensureOlborsIndexes(db);
    for (const d of docs) {
      const existing = await db.collection(EXCHANGES).findOne({ id: d.id });
      if (existing && existing.migration?.source !== "beer-exchange")
        throw new Error(`ID collision ${d.id}`);
    }
    await writeFile(
      path.join(backupDir, "destination-before.json"),
      JSON.stringify(
        await db
          .collection(EXCHANGES)
          .find({ id: { $in: docs.map((d) => d.id) } })
          .toArray(),
        null,
        2,
      ),
    );
    const uploadDir = path.resolve(
      process.env.OLBORS_MEDIA_DIR?.trim() || "data/olbors-media",
    );
    await mkdir(uploadDir, { recursive: true });
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    for (const filename of await readdir(path.join(backupDir, "uploads"))) {
      const bytes = await readFile(path.join(backupDir, "uploads", filename)),
        target = path.join(uploadDir, filename);
      try {
        const previous = await readFile(target);
        if (hash(previous) !== hash(bytes))
          throw new Error(`Media collision ${filename}`);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        await writeFile(target, bytes, { flag: "wx" });
      }
      if (hash(await readFile(target)) !== hash(bytes))
        throw new Error(`Media verification failed ${filename}`);
    }
    for (const d of docs)
      await db
        .collection(EXCHANGES)
        .updateOne({ id: d.id }, { $setOnInsert: d }, { upsert: true });
    for (const d of docs) {
      const saved = await db.collection(EXCHANGES).findOne({ id: d.id });
      for (const key of [
        "beers",
        "customers",
        "transactions",
        "priceUpdates",
      ]) {
        const ids = new Set(saved[key].map((r) => r.id));
        if (d[key].some((r) => !ids.has(r.id)))
          throw new Error(`Verification failed: ${d.id}/${key}`);
      }
    }
    console.log(
      "Migration verified. Existing imports were preserved; source was not modified.",
    );
  }
} catch (e) {
  console.error(
    `Migration stopped: ${e.code ?? ""} ${e.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[redacted]")}`,
  );
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
  await mongo.close();
}
