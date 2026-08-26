// Fires the Monitoring capability on the deployed app. One command on stage.
//   npm run demo:delay
//   npm run demo:delay -- --days 12 --cause "typhoon closure at Kaohsiung"

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const base = arg("url", process.env.DEPLOY_URL ?? "https://aibosses.vercel.app");
const key = process.env.DASHBOARD_KEY;
if (!key) throw new Error("DASHBOARD_KEY missing from .env.local");

const res = await fetch(`${base}/api/demo/delay`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-demo-key": key },
  body: JSON.stringify({
    reference: arg("ref", "TW-4471"),
    destination: arg("to", "Rotterdam"),
    cause: arg("cause", "port congestion at Kaohsiung"),
    days: Number(arg("days", "8")),
    cargo: arg("cargo", "1000 x 195/65R15"),
  }),
});
console.log(res.status, await res.text());
console.log("Monitoring is drafting. The card lands on the owner's phone in ~15s.");
