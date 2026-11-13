// End-to-end on Testnet Bradbury (Phase 2), on the packed code that is deployed:
//
//   python deploy/shrink.py contracts/refund_watch.py build/refund_watch.py --pack
//   npm i genlayer-js@2.0.0-rc.2   # plus the estimateTransactionFees patch in app/README.md
//   GL_PK0=0x... GL_PK1=0x... GL_PK2=0x... node tests/integration/bradbury.mjs build/refund_watch.py [contract]
//
// GL_PK0 deploys with one approved source, the host serving evidence/ (EVIDENCE), and organizes;
// GL_PK1 and GL_PK2 buy. Only the owner approves sources. A page on any other host (an organizer's own
// site, the parent domain) is refused before it is read; a page that does not show the event number
// cannot be listed; an event number is listed once per source. A page that already announces a
// postponement cannot be listed. Spring Gala: the organizer cannot buy, a wrong
// amount is refused, nothing is refundable while the page says nothing; then the page is edited to
// announce the cancellation (the run waits for it), validators read it and quote it, sales close and
// anyone refunds each buyer once. Quiz Night: only the organizer cancels, and the buyer is refunded.
// Harbour Lights starts minutes after listing: release is refused during the hold, then validators
// read the page one last time and the organizer is paid. Every payout settles from its own transfer.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAccount, createClient, MessageType, encodeExternalMessageFeeParams } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const PRICE = 10n ** 14n, HOUR = 3600;
const EVIDENCE = process.env.EVIDENCE ?? "https://refundwatch.cristhedev.com/evidence/";
const HOST = new URL(EVIDENCE).host, SOURCES = new Map([[HOST, "RefundWatch demo venue (evidence pages)"]]);
const GALA = EVIDENCE + "spring-gala.html", HARBOUR = EVIDENCE + "harbour-lights.html", QUIZ = EVIDENCE + "quiz-night.html", FAIR = EVIDENCE + "book-fair-postponed.html";
const CONSENSUS_MAIN = "0x2e2766cbc3e5e61ce93bbcdcbb3eacb82082a019";
const T_FINALIZED = "0x24196ec40f90671b7144e716978686b4f3c7d6b00b23da3971ef2b52af27d87f";
const PAYOUT_GAS = 100000n, PAYOUT_GAS_PRICE = 1000000000n;
// rpc.testnet-chain.genlayer.com (the chain default) does not serve gen_call; this one serves the same chain.
const endpoint = "https://rpc-bradbury.genlayer.com";
const a0 = createAccount(process.env.GL_PK0);
const a1 = createAccount(process.env.GL_PK1);
const a2 = createAccount(process.env.GL_PK2);
const c0 = createClient({ chain: testnetBradbury, endpoint, account: a0 });
const c1 = createClient({ chain: testnetBradbury, endpoint, account: a1 });
const c2 = createClient({ chain: testnetBradbury, endpoint, account: a2 });
const sha = (t) => createHash("sha256").update(t).digest("hex");
const page = async (url) => sha(Buffer.from(await (await fetch(url)).arrayBuffer()));
const fees = async (c, payee) => {
  const messageAllocations = payee && [{
    messageType: MessageType.External, onAcceptance: false, recipient: payee, budget: PAYOUT_GAS * PAYOUT_GAS_PRICE,
    callKey: "0x" + "00".repeat(32), feeParams: encodeExternalMessageFeeParams({ gasLimit: PAYOUT_GAS, maxGasPrice: PAYOUT_GAS_PRICE }),
  }];
  // A read, so retrying a dropped connection is safe.
  let e;
  for (let i = 0; !e; i++) {
    try { e = await c.estimateTransactionFees(payee ? { messageAllocations } : {}); }
    catch (err) { if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket/i.test(String(err?.details ?? err?.message))) throw err; await new Promise((r) => setTimeout(r, 10000)); }
  }
  return { distribution: e.distribution, feeValue: e.feeValue, ...(payee && { messageAllocations: e.messageAllocations }) };
};
// The public RPC drops connections now and then; retry the wait, never the write.
async function wait(c, hash, waitUntil = "decided") {
  for (let i = 0; ; i++) {
    try {
      return await c.waitForTransactionReceipt({ hash, waitUntil, interval: 10000, retries: 360 });
    } catch (e) {
      if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket/i.test(String(e?.details ?? e?.message))) throw e;
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}
const check = (ok, what) => {
  console.log(ok ? "  ok  " : "  FAIL", what);
  if (!ok) process.exit(1);
};
// A leader timeout (NOT_VOTED) executed nothing, so sending the call again is safe. Bradbury still
// moves the value of such a transaction, and of a reverted one, into the contract, where
// get_accounting shows it as unaccounted.
let stray = 0n;
async function tx(c, label, functionName, args, { value = 0n, payee } = {}) {
  for (let i = 0; ; i++) {
    const hash = await c.writeContract({ address, functionName, args, value, fees: await fees(c, payee) });
    const r = await wait(c, hash);
    console.log(`${label}: ${hash} ${r.txExecutionResultName}`);
    if (r.txExecutionResultName !== "FINISHED_WITH_RETURN") stray += value;
    if (r.txExecutionResultName !== "NOT_VOTED" || i >= 2) return { ...r, hash };
  }
}
const ok = async (...a) => { const r = await tx(...a); check(r.txExecutionResultName === "FINISHED_WITH_RETURN", `${a[1]} succeeds`); return r; };
const fails = async (what, ...a) => check((await tx(...a)).txExecutionResultName !== "FINISHED_WITH_RETURN", what);
const read = async (functionName, args = []) => {
  const v = await c0.readContract({ address, functionName, args });
  const plain = (x) => (x instanceof Map ? Object.fromEntries([...x].map(([k, y]) => [k, plain(y)])) : Array.isArray(x) ? x.map(plain) : x);
  return plain(v);
};
// RPC nodes behind the edge can lag the one that reported the receipt: re-read until `ok` holds (or give up).
async function settled(fn, args, ok) {
  for (let i = 0; ; i++) {
    const v = await read(fn, args);
    if (ok(v) || i >= 12) return v;
    await new Promise((r) => setTimeout(r, 10000));
  }
}
// Reads only, so retrying a dropped connection is safe.
const rpc = async (method, params) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "user-agent": "refundwatch-e2e" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      return (await r.json()).result;
    } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 10000)); }
  }
};
// The consensus-layer transaction that finalized `hash`: it emits TransactionFinalized(txId).
async function finalizeTx(hash, fromBlock) {
  for (;;) {
    const to = BigInt(await rpc("eth_blockNumber", []));
    for (let b = fromBlock; b <= to; b += 1000n) {
      const end = b + 999n > to ? to : b + 999n;
      const logs = await rpc("eth_getLogs", [{ address: CONSENSUS_MAIN, topics: [T_FINALIZED, hash], fromBlock: "0x" + b.toString(16), toBlock: "0x" + end.toString(16) }]);
      if (logs?.length) return logs[0].transactionHash;
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
}
async function settle(id, paid, fromBlock) {
  await wait(c0, paid.hash, "finalized");
  const fin = await finalizeTx(paid.hash, fromBlock);
  console.log(`finalized by ${fin}`);
  await ok(c2, `settle payout ${id}`, "settle_payout", [id, paid.hash, fin]);
  check((await settled("get_payout", [id], (x) => x.status === "DELIVERED")).status === "DELIVERED", `payout ${id} DELIVERED`);
  await fails("a payout settles once", c2, "settle again", "settle_payout", [id, paid.hash, fin]);
}

let address = process.argv[3];
if (!address) {
  const hash = await c0.deployContract({ code: readFileSync(process.argv[2], "utf8"), args: [SOURCES], fees: await fees(c0) });
  const r = await wait(c0, hash);
  address = r.txDataDecoded?.contractAddress;
  console.log(`deploy: ${hash} ${r.txExecutionResultName} -> ${address}`);
  check(r.txExecutionResultName === "FINISHED_WITH_RETURN", "deployed");
}
const fromBlock = BigInt(await rpc("eth_blockNumber", []));
stray = BigInt((await read("get_accounting")).unaccounted);
const org = a0.address, b1 = a1.address, b2 = a2.address, low = (x) => x?.toLowerCase();
const now = () => Math.floor(Date.now() / 1000);
const eid = Number((await read("get_events", [0, 1])).total), tid = Number((await read("get_tickets", [-1, "", 0, 1])).total);
const pid = Number((await read("get_accounting")).payout_count);
const text = async (url) => (await fetch(url, { cache: "no-store" })).text();
check(!(await text(GALA)).includes("has been cancelled"), "the Spring Gala page announces nothing yet");

// Sources: only approved hosts, approved only by the owner.
check(JSON.stringify(await read("get_sources")).includes(HOST), `${HOST} is the approved source`);
await fails("only the owner approves sources", c1, "approve a source as a buyer", "set_source", ["organizer.cristhedev.com", "Organizer"]);
await fails("an organizer-controlled page is refused", c0, "list on the organizer's own site", "list_event", ["Spring Gala", "LH-0614-SG", GALA.replace(HOST, "organizer.cristhedev.com"), now() + 7 * 24 * HOUR, PRICE, 100, 24]);
await fails("an unrelated host is refused", c0, "list on the parent domain", "list_event", ["Spring Gala", "LH-0614-SG", GALA.replace(HOST, "cristhedev.com"), now() + 7 * 24 * HOUR, PRICE, 100, 24]);
await fails("a page that does not show the event number cannot be listed", c0, "list the Spring Gala on the Harbour Lights page", "list_event", ["Spring Gala", "LH-0614-SG", HARBOUR, now() + 7 * 24 * HOUR, PRICE, 100, 24]);

// Harbour Lights first: it starts 20 minutes from now and holds the money for one hour after.
await fails("a page that already announces a postponement cannot be listed", c0, "list the postponed book fair", "list_event", ["Autumn Book Fair", "LH-0919-BF", FAIR, now() + 7 * 24 * HOUR, PRICE, 50, 24]);
await ok(c0, "list Harbour Lights", "list_event", ["Harbour Lights Concert", "LH-0520-HL", HARBOUR, now() + 20 * 60, PRICE, 50, 1]);
await ok(c1, "buy 1 Harbour Lights seat", "buy", [eid, 1], { value: PRICE });
await fails("release is refused during the hold", c1, "release before the hold ends", "release", [eid], { payee: org });

// Spring Gala: escrowed, then called off on its official page.
await ok(c0, "list the Spring Gala", "list_event", ["Spring Gala", "LH-0614-SG", GALA, now() + 7 * 24 * HOUR, PRICE, 100, 24]);
await fails("an event number is listed once per source", c0, "list the Spring Gala again", "list_event", ["Spring Gala (again)", "LH-0614-SG", GALA, now() + 7 * 24 * HOUR, PRICE, 100, 24]);
await fails("the organizer cannot buy", c0, "buy as the organizer", "buy", [eid + 1, 1], { value: PRICE });
await fails("the amount must be price x count", c1, "buy 2 seats paying for 1", "buy", [eid + 1, 2], { value: PRICE });
await ok(c1, "buy 2 Spring Gala seats", "buy", [eid + 1, 2], { value: 2n * PRICE });
await ok(c2, "buy 1 Spring Gala seat", "buy", [eid + 1, 1], { value: PRICE });
await fails("nothing is refundable while the page says nothing", c2, "refund while on", "refund", [tid + 1], { payee: b1 });
await ok(c2, "read the page (nothing yet)", "check", [eid + 1]);
let e = await settled("get_event", [eid + 1], (x) => Number(x.checks) === 1);
check(e.status === "ON" && Number(e.sold) === 3 && BigInt(e.held) === 3n * PRICE, "still on; 3 seats in escrow");
console.log("waiting for the Spring Gala page to announce the cancellation…");
while (!(await text(GALA)).includes("has been cancelled")) await new Promise((r) => setTimeout(r, 15000));
await ok(c2, "read the page (cancelled)", "check", [eid + 1]);
e = await settled("get_event", [eid + 1], (x) => x.status !== "ON");
check(e.status === "CANCELLED" && (await text(GALA)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase().includes(e.quote.toLowerCase()), `CANCELLED, quoted from the page: “${e.quote}”`);
await fails("sales close once called off", c2, "buy after the cancellation", "buy", [eid + 1, 1], { value: PRICE });
const r1 = await ok(c2, "refund ticket 1 (anyone sends it)", "refund", [tid + 1], { payee: b1 });
await fails("a ticket is refunded once", c2, "refund ticket 1 again", "refund", [tid + 1], { payee: b1 });
const r2 = await ok(c2, "refund ticket 2", "refund", [tid + 2], { payee: b2 });

// Quiz Night: called off by its organizer.
await ok(c0, "list Quiz Night", "list_event", ["Quiz Night", "LH-0702-QN", QUIZ, now() + 7 * 24 * HOUR, PRICE, 30, 24]);
await ok(c2, "buy 1 Quiz Night seat", "buy", [eid + 2, 1], { value: PRICE });
await fails("only the organizer cancels", c2, "cancel as a buyer", "cancel", [eid + 2]);
await ok(c0, "cancel Quiz Night", "cancel", [eid + 2]);
const r3 = await ok(c1, "refund the Quiz Night ticket", "refund", [tid + 3], { payee: b2 });

// Harbour Lights went ahead: after the hold, one last reading, then the organizer is paid.
e = await read("get_event", [eid]);
const left = Number(e.release_at) - now() + 60;
if (left > 0) { console.log(`waiting ${Math.ceil(left / 60)} min for the Harbour Lights hold to end…`); await new Promise((r) => setTimeout(r, left * 1000)); }
const rel = await ok(c1, "release Harbour Lights", "release", [eid], { payee: org });
e = await settled("get_event", [eid], (x) => x.status !== "ON");
check(e.status === "RELEASED" && BigInt(e.held) === 0n, "RELEASED to the organizer");

const ps = [];
for (let i = 0; i < 4; i++) ps.push(await settled("get_payout", [pid + i], (x) => !!x?.kind));
const want = [["refund", 2n * PRICE, b1], ["refund", PRICE, b2], ["refund", PRICE, b2], ["release", PRICE, org]];
want.forEach(([kind, amount, to], i) => check(ps[i].kind === kind && BigInt(ps[i].amount) === amount && low(ps[i].to) === low(to), `payout ${pid + i}: ${kind} ${amount} to ${to.slice(0, 8)}`));
for (const [i, t] of [r1, r2, r3, rel].entries()) await settle(pid + i, t, fromBlock);
check(BigInt((await read("get_accounting")).unaccounted) === stray, `balance matches what the contract expects to hold (+${stray} from unexecuted or reverted txs)`);
console.log("contract", address, "events", eid, eid + 1, eid + 2);
