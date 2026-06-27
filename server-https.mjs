// Custom HTTPS dev server for Next.js
// Serves the app over HTTPS using the self-signed cert in ./certs/
// Also runs an HTTP redirect server on port 3080 so http:// links auto-redirect.
//
// Usage:  npm run dev:lan
// Access: https://172.20.10.2:3000  (accept the cert warning once in Firefox)

import { createServer as createHttpsServer } from "https";
import { createServer as createHttpServer }  from "http";
import { readFileSync, existsSync } from "fs";
import { parse } from "url";
import next from "next";
import { networkInterfaces } from "os";

const HOST       = "0.0.0.0";
const HTTPS_PORT = parseInt(process.env.PORT      || "3000", 10);
const HTTP_PORT  = parseInt(process.env.HTTP_PORT || "3080", 10);
const dev        = process.env.NODE_ENV !== "production";

function getLanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "YOUR_LAN_IP";
}

// Load TLS cert
let certKey, certCrt;
try {
  // Use CA-signed cert (certs/server.key + certs/server.crt)
  // Fall back to self-signed (certs/key.pem + certs/cert.pem) if not present
  const hasSignedCert = existsSync("./certs/server.key") && existsSync("./certs/server.crt");
  certKey = readFileSync(hasSignedCert ? "./certs/server.key" : "./certs/key.pem");
  certCrt = readFileSync(hasSignedCert ? "./certs/server.crt" : "./certs/cert.pem");
} catch {
  console.error("\nERROR: SSL certificate files not found in ./certs/");
  process.exit(1);
}

const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const lan = getLanIp();

  // 1. HTTPS server — serves the actual app
  createHttpsServer({ key: certKey, cert: certCrt }, (req, res) => {
    handle(req, res, parse(req.url, true));
  }).listen(HTTPS_PORT, HOST, () => {
    console.log("\n  AEGIS HSSE Platform");
    console.log("  ==================");
    console.log("\n  HTTPS (main):  https://localhost:" + HTTPS_PORT);
    console.log("  HTTPS (LAN):   https://" + lan + ":" + HTTPS_PORT);
    console.log("\n  HTTP redirect: http://"  + lan + ":" + HTTP_PORT + "  ->  https://" + lan + ":" + HTTPS_PORT);
    console.log("\n  First time: Firefox will warn about the cert.");
    console.log("  Click Advanced -> Accept the Risk and Continue.\n");
  });

  // 2. HTTP redirect server — redirects any http:// request to https://
  createHttpServer((req, res) => {
    const host   = (req.headers.host || lan).replace(":" + HTTP_PORT, "");
    const target = "https://" + host + ":" + HTTPS_PORT + (req.url || "/");
    res.writeHead(301, { Location: target });
    res.end(
      "<html><body>Redirecting to <a href='" + target + "'>" + target + "</a></body></html>"
    );
  }).listen(HTTP_PORT, HOST, () => {
    // quiet — already printed above
  });
});
