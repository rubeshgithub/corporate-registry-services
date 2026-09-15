import crypto from "node:crypto";
import net from "node:net";

/* The client IP behind per-IP rate limits and the ipHash stored with leads.
 *
 *  Requests reach Render through Cloudflare: the domain is proxied on
 *  Cloudflare, and Render's own edge is Cloudflare too (onrender.com hostnames
 *  resolve through cdn.cloudflare.net). Cloudflare APPENDS the visitor's
 *  address to any X-Forwarded-For the visitor sent, so the first entry is
 *  whatever the visitor chose to write. CF-Connecting-IP is set by Cloudflare
 *  and replaces a value the visitor sent.
 *
 *  Render's proxies then append the address each one received the request
 *  from, e.g. "visitor, 172.71.195.123 (Cloudflare), 10.226.90.65 (Render)".
 *  Nothing the visitor sends can land to the right of those. So, reading from
 *  the right: skip private hops, and take the first public one as the peer
 *  that reached Render. If that peer is Cloudflare, CF-Connecting-IP is
 *  trustworthy. If not, the request bypassed Cloudflare and could carry any
 *  CF-Connecting-IP, so the peer's own address is used instead. */

/* https://www.cloudflare.com/ips-v4 and /ips-v6, as of 2026-09-15. */
const CLOUDFLARE = new net.BlockList();
for (const cidr of [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
  "2a06:98c0::/29", "2c0f:f248::/32",
]) addCidr(CLOUDFLARE, cidr);

/* Loopback, RFC 1918, carrier-grade NAT, link-local and IPv6 ULA. */
const PRIVATE = new net.BlockList();
for (const cidr of [
  "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "100.64.0.0/10", "169.254.0.0/16",
  "::1/128", "fc00::/7", "fe80::/10",
]) addCidr(PRIVATE, cidr);

function addCidr(list: net.BlockList, cidr: string): void {
  const [address, prefix] = cidr.split("/");
  list.addSubnet(address, Number(prefix), net.isIP(address) === 6 ? "ipv6" : "ipv4");
}

function inList(list: net.BlockList, ip: string): boolean {
  const family = net.isIP(ip);
  return family !== 0 && list.check(ip, family === 6 ? "ipv6" : "ipv4");
}

let warned = false;

/** The visitor's IP as far as it can't be forged, or undefined if unknown. */
export function clientIp(request: Request): string | undefined {
  const hops = (request.headers.get("x-forwarded-for") ?? "")
    .split(",").map((h) => h.trim()).filter(Boolean);
  const peer = hops.findLast((h) => !inList(PRIVATE, h)) ?? hops[hops.length - 1];
  if (peer && inList(CLOUDFLARE, peer)) {
    const ip = request.headers.get("cf-connecting-ip")?.trim();
    if (ip) return ip;
  }
  /* On Render every visitor's request should have taken the branch above. */
  if (process.env.RENDER && !warned) {
    warned = true;
    console.warn("[CRS] client IP: request without a Cloudflare hop and CF-Connecting-IP; per-IP limits fall back to the proxy peer");
  }
  return peer && !inList(CLOUDFLARE, peer) ? peer : undefined;
}

/** clientIp() as sha256, first 24 hex chars, the form stored as ipHash. */
export function ipHashFrom(request: Request): string | undefined {
  const ip = clientIp(request);
  return ip ? crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24) : undefined;
}
