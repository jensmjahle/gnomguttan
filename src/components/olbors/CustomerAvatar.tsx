import { useState } from "react";

export function CustomerAvatar({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState<string>();
  return <span className="ol-small-avatar">
    {name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
    {src && failed !== src && <img src={src} alt="" onError={() => setFailed(src)} />}
  </span>;
}
