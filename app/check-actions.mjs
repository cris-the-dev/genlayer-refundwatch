// Asserts which RefundWatch app controls appear per role, event state and time, and that GEN amounts are exact
// (run: node app/check-actions.mjs app/index.html).
import { readFileSync } from "node:fs";
const html = readFileSync(process.argv[2], "utf8");
const js = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const body = js.slice(js.indexOf("function actions"), js.indexOf("async function show"));
// gen / toWei come straight from gl.js (which imports the browser bundle, so it is not loaded whole).
const gl = readFileSync(new URL("./gl.js", import.meta.url), "utf8");
const pick = (name) => gl.slice(gl.indexOf(`export const ${name} =`), gl.indexOf("\n};\n", gl.indexOf(`export const ${name} =`)) + 3).replace("export ", "");
const { gen, toWei } = new Function(`${pick("gen")}\n${pick("toWei")}\nreturn { gen, toWei };`)();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const line = (name) => js.match(new RegExp(`const ${name} = .*;`))[0];
const make = new Function("esc", "gen", "B", "short", "EXPLORER", "ctx", `let me = ctx.me; const when = (t) => String(t); ${line("addr")} ${line("plural")} ${line("refundable")} ${body}; return { actions, reading };`);
const O = "0xOrganizer", NOW = 1000, PRICE = 10n ** 15n;
const ev = { id: 0, organizer: O, title: "Gala", status: "ON", starts_at: NOW + 10, release_at: NOW + 100, lapse_at: NOW + 200, price: PRICE, capacity: 5, sold: 3, refunded: 0, held: 3n * PRICE };
const tk = (id, o = {}) => ({ id, buyer: "0xBuyer", count: 2, status: "HELD", ...o });
const fns = (me) => make(esc, gen, BigInt, (a) => a, "x", { me });
const run = (me, e = {}, tickets = [tk(0), tk(1, { count: 1 })], recov = 0, now = NOW) => fns(me).actions({ ...ev, ...e }, tickets, recov, now);
const count = (s, x) => s.split(x).length - 1;
const check = (name, ok) => { console.log(ok ? "ok  " : "FAIL", name); if (!ok) process.exitCode = 1; };

check("no wallet: prompt only", run(null).includes("Connect a wallet") && !run(null).includes("form"));
check("buyers buy before the start, capped by seats left", run("0xB").includes('data-form="buy"') && run("0xB").includes('max="2"') && run("0xB").includes("2 left"));
check("no buying: organizer, sold out, started, called off", !run(O).includes('data-form="buy"') && !run("0xB", { sold: 5 }).includes('data-form="buy"') && !run("0xB", { starts_at: NOW }).includes('data-form="buy"') && !run("0xB", { status: "CANCELLED" }).includes('data-form="buy"'));
check("organizer (case-insensitive) cancels while on", run("0xorganizer").includes('data-form="cancel"') && !run("0xB").includes('data-form="cancel"') && !run(O, { status: "POSTPONED" }).includes('data-form="cancel"'));
check("anyone reads the page while on", run("0xB").includes('data-form="check"') && !run("0xB", { status: "RELEASED" }).includes('data-form="check"'));
check("release only after the hold, with the escrow amount", !run("0xB").includes('data-form="release"') && run("0xB", {}, [], 0, NOW + 100).includes("paid 0.003 GEN"));
check("nothing to refund while on and in time", !run("0xB").includes('data-form="refund"'));
check("called off: one refund per held ticket, exact amount", ["CANCELLED", "POSTPONED"].every((s) => count(run("0xB", { status: s }), 'data-form="refund"') === 2) && run("0xB", { status: "CANCELLED" }).includes("Refund 0.002 GEN") && run("0xB", { status: "CANCELLED" }).includes("Refund 0.001 GEN"));
check("refunded tickets take no button", count(run("0xB", { status: "CANCELLED" }, [tk(0, { status: "REFUNDED" }), tk(1)]), 'data-form="refund"') === 1);
check("never released: refunds open after the lapse, not at it", !run("0xB", {}, undefined, 0, NOW + 200).includes('data-form="refund"') && run("0xB", {}, undefined, 0, NOW + 201).includes('data-form="refund"'));
check("released: nothing left to do", !/data-form="(buy|check|cancel|release|refund)"/.test(run(O, { status: "RELEASED" }, undefined, 0, NOW + 999)));
check("recover only with a failed transfer", run("0xB", {}, [], 5n).includes('data-form="recover"') && !run("0xB", {}, [], 0n).includes("recover"));
check("buyer addresses are escaped", !run("0xB", { status: "CANCELLED" }, [tk(0, { buyer: "<img src=x>" })]).includes("<img"));
const r = fns("0xB").reading;
check("reading: quote shown and escaped", r({ answer: "cancelled", quote: "<b>off</b>", by: "0xB", at: 1 }).includes("&lt;b&gt;off") && !r({ answer: "none", quote: "", by: "0xB", at: 1 }).includes("“"));

// Money: exact in both directions, no floating point.
check("exact amounts", gen(10n ** 14n) === "0.0001" && gen(1) === "0.000000000000000001" && gen(0) === "0");
check("amounts past 2^53 stay exact", gen(9007199254740993n) === "0.009007199254740993" && toWei("0.009007199254740993") === 9007199254740993n);
check("toWei rejects bad input", ["", ".", "1e3", "-1", "0.1234567890123456789", "1,5"].every((s) => { try { toWei(s); return false; } catch { return true; } }));
