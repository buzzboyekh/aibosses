// Fires the Monitoring capability on the deployed app. One command on stage.
//   npm run demo:delay
//   npm run demo:delay -- --days 5 --cause "石斑休漁期，契作魚塭排單到下週"

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
    reference: arg("ref", "KT-0829"),
    destination: arg("to", "台北內湖"),
    cause: arg("cause", "颱風過境，西螺產區停止採收"),
    days: Number(arg("days", "3")),
    cargo: arg("cargo", "50 公斤石斑"),
  }),
});
console.log(res.status, await res.text());
console.log("Monitoring is drafting. The card lands on the owner's phone in ~15s.");
