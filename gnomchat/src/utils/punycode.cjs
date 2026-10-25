// RFC 3492 encoder for markdown-it's domain normalization. Expo has no Node core modules.
const MAX = 2147483647;
const digit = value => String.fromCharCode(value < 26 ? 97 + value : 22 + value);
function adapt(delta, count, first) {
  delta = first ? Math.floor(delta / 700) : Math.floor(delta / 2);
  delta += Math.floor(delta / count);
  let bias = 0;
  while (delta > 455) { delta = Math.floor(delta / 35); bias += 36; }
  return bias + Math.floor(36 * delta / (delta + 38));
}
function label(input) {
  const points = Array.from(input, character => character.codePointAt(0));
  if (points.every(point => point < 128)) return input;
  let output = points.filter(point => point < 128).map(point => String.fromCharCode(point)).join('');
  const basic = output.length;
  let handled = basic;
  if (basic) output += '-';
  let n = 128; let delta = 0; let bias = 72;
  while (handled < points.length) {
    const next = Math.min(...points.filter(point => point >= n));
    delta += (next - n) * (handled + 1);
    if (delta > MAX) throw new RangeError('Punycode overflow');
    n = next;
    for (const point of points) {
      if (point < n && ++delta > MAX) throw new RangeError('Punycode overflow');
      if (point !== n) continue;
      let q = delta;
      for (let k = 36; ; k += 36) {
        const threshold = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
        if (q < threshold) break;
        output += digit(threshold + (q - threshold) % (36 - threshold));
        q = Math.floor((q - threshold) / (36 - threshold));
      }
      output += digit(q);
      bias = adapt(delta, handled + 1, handled === basic);
      delta = 0; handled++;
    }
    delta++; n++;
  }
  return `xn--${output}`;
}
exports.toASCII = domain => {
  const at = domain.lastIndexOf('@');
  const prefix = at >= 0 ? domain.slice(0, at + 1) : '';
  return prefix + domain.slice(at + 1).replace(/[\u3002\uff0e\uff61]/g, '.').split('.').map(label).join('.');
};
function decode(input) {
  const delimiter = input.lastIndexOf('-');
  const output = delimiter < 0 ? [] : Array.from(input.slice(0, delimiter), character => character.codePointAt(0));
  let position = delimiter < 0 ? 0 : delimiter + 1;
  let n = 128; let i = 0; let bias = 72;
  while (position < input.length) {
    const previous = i;
    let weight = 1;
    for (let k = 36; ; k += 36) {
      if (position >= input.length) throw new RangeError('Invalid punycode');
      const code = input.charCodeAt(position++);
      const value = code >= 48 && code <= 57 ? code - 22 : code >= 65 && code <= 90 ? code - 65 : code >= 97 && code <= 122 ? code - 97 : 36;
      if (value >= 36 || value > Math.floor((MAX - i) / weight)) throw new RangeError('Invalid punycode');
      i += value * weight;
      const threshold = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (value < threshold) break;
      weight *= 36 - threshold;
      if (weight > MAX) throw new RangeError('Punycode overflow');
    }
    const length = output.length + 1;
    bias = adapt(i - previous, length, previous === 0);
    n += Math.floor(i / length); i %= length;
    if (n > 0x10ffff) throw new RangeError('Invalid Unicode code point');
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}
exports.toUnicode = domain => domain.replace(/[\u3002\uff0e\uff61]/g, '.').split('.').map(part => /^xn--/i.test(part) ? decode(part.slice(4).toLowerCase()) : part).join('.');
