# RefundWatch — ticket escrow refunded when the official page calls the event off

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

When a concert, match or gala is cancelled, buyers wait weeks for the organizer
to refund, and a small organizer who has already spent the money may never do
it. **RefundWatch** keeps ticket money in escrow until the event is over. The
organizer names the official page where a cancellation would be announced (the
venue's, the league's, the airline's) and the event number printed on it; the
page must be on a host the contract owner approved as an event source, and
must show that number. Anyone can ask GenLayer validators to
read it: if it says the event is cancelled or postponed, quoted word for word,
every ticket becomes refundable and anyone can send each buyer's money back.
If the event went ahead, the organizer is paid after a hold, once validators
read the page one last time.

```
owner     ── deploy(sources) / set_source(host, name)          approved venue / league hosts
organizer ── list_event(title, ref, url, starts_at, price, capacity, hold_hours) ─▶ RefundWatch
             url on an approved host (or its subdomain), else refused before any reading;
             validators read the page now: reachable, ≤ 20,000 characters, shows event `ref`,
             announces nothing yet; one listing per (source, ref)
buyer     ── buy(event, count) + price × count            (before the start; money held here)
anyone    ── check(event): validators read the page and agree on none / cancelled / postponed,
             plus a sentence each of them finds on its own copy
             cancelled | postponed ─▶ every ticket refundable, sales closed
organizer ── cancel(event) ─▶ CANCELLED                    (same effect, no reading)
anyone    ── refund(ticket) ─▶ price × count to the buyer  (called off, or never released 30 days after the hold)
anyone    ── release(event)  after starts_at + hold_hours: one last reading;
             still nothing ─▶ RELEASED, unrefunded seats paid to the organizer
anyone    ── settle_payout(payout, tx, finalize_tx) / payee ── recover(to)
```

## Live deployment

App: https://refundwatch.cristhedev.com (events, their sources, readings with quotes, tickets and every role's actions; source in [`app/`](app/))  
Testnet Bradbury Phase 2 (chainId 4221, GenVM v0.3): [`0xBE9d25309FCB7C2A6348fe43a69f5c96E0c7cbdf`](https://explorer-bradbury.genlayer.com/address/0xBE9d25309FCB7C2A6348fe43a69f5c96E0c7cbdf) (v1.1.0: approved sources and event numbers)

## Bradbury evidence

Run by [`tests/integration/bradbury.mjs`](tests/integration/bradbury.mjs) on Bradbury Phase 2 (all checks passed). Contract `0xBE9d25309FCB7C2A6348fe43a69f5c96E0c7cbdf` (deploy [`0x10dff511…`](https://explorer-bradbury.genlayer.com/tx/0x10dff511b8fe2864744d109ec7f1e07081f6571c7d0c73d0e9860cf1dbf18ca6)), code `build/refund_watch.py` (sha256 `5a62c7c0…`), deployed with one approved source, `refundwatch.cristhedev.com` (the demo venue serving [`evidence/`](evidence/)). Owner/organizer and two buyers are separate accounts. Mid-run the Spring Gala page was replaced by [`spring-gala-cancelled.html`](evidence/spring-gala-cancelled.html), and the run waited for it.

| Step | Transaction | Outcome |
|---|---|---|
| approve a source as a buyer | [`0xbd02ff2e…`](https://explorer-bradbury.genlayer.com/tx/0xbd02ff2e8bf290a303327323517c96686efee57ddd484dbbddd96ccee98bf591) | rejected: only the owner approves sources |
| list on the organizer's own site | [`0xe06df07a…`](https://explorer-bradbury.genlayer.com/tx/0xe06df07a0a1ec980dcf9d95a96eda6a7d75b783f49dbb52ea052ac3f62ec4607) | **refused before reading: `organizer.cristhedev.com` is not an approved event source** |
| list on the parent domain | [`0x546e4083…`](https://explorer-bradbury.genlayer.com/tx/0x546e40833301c34fe1e072833333e184da3b741201475631e988bda6c82043ab) | **refused before reading: `cristhedev.com` is not an approved event source** |
| list the Spring Gala on the Harbour Lights page | [`0xd6b938d4…`](https://explorer-bradbury.genlayer.com/tx/0xd6b938d46d8945690b8919f6c5c8759244b6a24662b5f891adfd9948c91b10d3) | **reverts: the page does not show event LH-0614-SG** |
| list the postponed book fair | [`0xeded4613…`](https://explorer-bradbury.genlayer.com/tx/0xeded461338acabea43fbfc162768efb9a2089950318fb52b91a37f24aef3575a) | reverts: the page already says the event is postponed |
| list Harbour Lights | [`0x7364fefb…`](https://explorer-bradbury.genlayer.com/tx/0x7364fefbf2306c1d956202a8ebafa1ad3ebb07d6703b9aa8f036395dda1c3619) | ok: event #0, starts in 20 min, 1 h hold |
| buy 1 Harbour Lights seat | [`0x8f16d2eb…`](https://explorer-bradbury.genlayer.com/tx/0x8f16d2ebe13ecc3ab13004a12a7223b632587c32bfba00176446eea089ca1290) | ok: 0.0001 GEN in escrow |
| release before the hold ends | [`0x8fca3dbc…`](https://explorer-bradbury.genlayer.com/tx/0x8fca3dbce2a6812c1158bcea525af2640e2a3ed4818f33a5fcf46c33a86c8f1f) | rejected: the hold has not ended |
| list the Spring Gala | [`0x625b1442…`](https://explorer-bradbury.genlayer.com/tx/0x625b144270f68bdc8076c01b33e8f6c0293993de80a0a648b745f522bad29e45) | ok: event #1, page read: nothing announced |
| list the Spring Gala again | [`0x7304a82e…`](https://explorer-bradbury.genlayer.com/tx/0x7304a82e3c47a8c28a114d61491cf2755c6c5b70ad61e5a358c7beb7d6711b4c) | rejected: event LH-0614-SG on this source is already listed (#1) |
| buy as the organizer | [`0x9db57a48…`](https://explorer-bradbury.genlayer.com/tx/0x9db57a487e8db8990db8e91d184c3abb413c9ca75b7bc487b347db3f1b760000) | rejected: the organizer cannot buy |
| buy 2 seats paying for 1 | [`0x2d900b9b…`](https://explorer-bradbury.genlayer.com/tx/0x2d900b9b6bbca08758f6a398ca6c1897c8b202265fa27abf7c176f8e3e0b9b38) | rejected: send exactly price × count |
| buy 2 Spring Gala seats | [`0x23194baa…`](https://explorer-bradbury.genlayer.com/tx/0x23194baab14ad341c5aa42a655bde475d4a237e6f636b1771d98cc9dcfa75202) | ok: ticket #1 |
| buy 1 Spring Gala seat | [`0x4cab8f55…`](https://explorer-bradbury.genlayer.com/tx/0x4cab8f5597e6209d9bac57a375019af3efe44f462544f24f7af45c4d193fb97d) | ok: ticket #2 |
| refund while on | [`0x7e7e6190…`](https://explorer-bradbury.genlayer.com/tx/0x7e7e6190fe5b5e561c26ce2f6f4cccb9357d9014812ed38d9a0017152c650002) | rejected: event is ON, nothing to refund |
| read the page (nothing yet) | [`0x0c6010e4…`](https://explorer-bradbury.genlayer.com/tx/0x0c6010e4b8b8b882a70d6d6ebc2aac232b830454b14f6e9eba0d852e83c12ca8) | `none`: still ON, 3 seats in escrow |
| read the page (cancelled) | [`0x57f59a38…`](https://explorer-bradbury.genlayer.com/tx/0x57f59a3813e68fd4be2313460511cb9629609a344f154ecb3c94ed1e2ee7efdf) | **`cancelled`**, quoted: “The Spring Gala has been cancelled due to storm damage to the roof of the Main Hall.” |
| buy after the cancellation | [`0x605d1d55…`](https://explorer-bradbury.genlayer.com/tx/0x605d1d55e916eadd3e3e38e2db287936fbc254db4b4ee0183f7d5f4e895c344e) | rejected: sales closed |
| refund ticket 1 (anyone sends it) | [`0x31719a7b…`](https://explorer-bradbury.genlayer.com/tx/0x31719a7bedbf322ba8e0246a9400b20466f5309e3618f924329851099ea89851) | 0.0002 GEN to the buyer = payout 0 (sent by another account) |
| refund ticket 1 again | [`0x1cf91818…`](https://explorer-bradbury.genlayer.com/tx/0x1cf918188a02d60daf906697d4508663d7e0d2fd720e31cb791e08fc9d5827e3) | rejected: already refunded |
| refund ticket 2 | [`0xda40212a…`](https://explorer-bradbury.genlayer.com/tx/0xda40212ada2ba979bc8b112ebf809badc1107ece1a39f0cf6d586074959cdd46) | 0.0001 GEN to the buyer = payout 1 |
| list Quiz Night | [`0xc15509f4…`](https://explorer-bradbury.genlayer.com/tx/0xc15509f438ff46833d405860d76c9405f197923774a8ac583355a7bbacb44646) | ok: event #2 |
| buy 1 Quiz Night seat | [`0xaaf90a9c…`](https://explorer-bradbury.genlayer.com/tx/0xaaf90a9cf33143044b264c3a4e9f142a34b6ebb37b29db2f9be380280f2fe5cb) | ok: ticket #3 |
| cancel as a buyer | [`0x71c8ce56…`](https://explorer-bradbury.genlayer.com/tx/0x71c8ce56f74e0e03fd811dbdebc9fed610a58e5729ff6104e5749e39681a8bf9) | rejected: organizer only |
| cancel Quiz Night | [`0x2f256963…`](https://explorer-bradbury.genlayer.com/tx/0x2f2569632a6d68da422462fcbc4c10878b6605c128e4c8a755f00bf223d34b9c) | CANCELLED by the organizer |
| refund the Quiz Night ticket | [`0x1403ab15…`](https://explorer-bradbury.genlayer.com/tx/0x1403ab156b5b9e4e6d2926688f956c2b866e30fbda8d5be72cee193ec6aef4aa) | 0.0001 GEN to the buyer = payout 2 |
| release Harbour Lights | [`0xd5ab78c3…`](https://explorer-bradbury.genlayer.com/tx/0xd5ab78c3a8bce51cd4fab95510eea73e8b0d997149ee78e503ee38bd9fe8c968) | **after the hold, one last reading: `none`, RELEASED**, 0.0001 GEN to the organizer = payout 3 |

Every payout was settled from its own transfer once the paying transaction finalized:

| Payout | Kind | Paid by | Finalized by | `settle_payout` | Result |
|---|---|---|---|---|---|
| 0 | refund → buyer (Spring Gala, 2 seats) | [`0x31719a7b…`](https://explorer-bradbury.genlayer.com/tx/0x31719a7bedbf322ba8e0246a9400b20466f5309e3618f924329851099ea89851) | [`0x21610e26…`](https://explorer-bradbury.genlayer.com/tx/0x21610e26b431bc0fda97ac6008c19c9d105f38240024e78f1d653e4138f89856) | [`0x2207591a…`](https://explorer-bradbury.genlayer.com/tx/0x2207591aecce633349c884383d83e194d8aa8c791686d9be21f7a094658ad32a) | DELIVERED |
| 1 | refund → buyer (Spring Gala, 1 seat) | [`0xda40212a…`](https://explorer-bradbury.genlayer.com/tx/0xda40212ada2ba979bc8b112ebf809badc1107ece1a39f0cf6d586074959cdd46) | [`0xbf750eb4…`](https://explorer-bradbury.genlayer.com/tx/0xbf750eb41d5f7aaf590a1c28d80bac9f6c6baf1ee41fc2e2899201beae99d172) | [`0x24392563…`](https://explorer-bradbury.genlayer.com/tx/0x24392563066bffedc6cc5db384533453658ab8c2a988d82264997f06e028e055) | DELIVERED |
| 2 | refund → buyer (Quiz Night) | [`0x1403ab15…`](https://explorer-bradbury.genlayer.com/tx/0x1403ab156b5b9e4e6d2926688f956c2b866e30fbda8d5be72cee193ec6aef4aa) | [`0x75de41d1…`](https://explorer-bradbury.genlayer.com/tx/0x75de41d1070b23f21d1a0d6f0b9d05f3766c5c3ca086d7cd10143b2288ec9c60) | [`0xb544322f…`](https://explorer-bradbury.genlayer.com/tx/0xb544322fe0bbd8407c9159bd0959855cbaf9b531a52834c90f98d7f91383650f) | DELIVERED |
| 3 | release → organizer (Harbour Lights) | [`0xd5ab78c3…`](https://explorer-bradbury.genlayer.com/tx/0xd5ab78c3a8bce51cd4fab95510eea73e8b0d997149ee78e503ee38bd9fe8c968) | [`0x2085164e…`](https://explorer-bradbury.genlayer.com/tx/0x2085164eefb0aa52cfd2c18e229a47726c1107c964b6f400f778bc50c23fdc6b) | [`0x5263e755…`](https://explorer-bradbury.genlayer.com/tx/0x5263e755a24b56d042df3b99f4c95bcfed7a594cf73cee44beb723b1935d0671) | DELIVERED |

Settling the same payout again is rejected ([`0x88629657…`](https://explorer-bradbury.genlayer.com/tx/0x88629657c0f07a12e9ef9e19c66af743936f83eaa29bee57edacf0c262a33c95), [`0xdde8f3e7…`](https://explorer-bradbury.genlayer.com/tx/0xdde8f3e7649f8b8fe13f4e2b702dc87721b015a9e2debea270fecad0caae3035), [`0x5d606f5f…`](https://explorer-bradbury.genlayer.com/tx/0x5d606f5f70b2e5cecfa22e173079babb796e3a10c2342d6feaf563ff9c7ee564), [`0x8d020628…`](https://explorer-bradbury.genlayer.com/tx/0x8d020628c2339ac088d15ecc3bda37130614ad628fde716504e23f6c7a355ecf)). Afterwards `get_accounting` reports `unaccounted: 0.0003` GEN: exactly the value attached to the three rejected payable transactions (organizer's buy, the underpaid buy, the buy after the cancellation). On Bradbury a reverted payable transaction leaves its value in the contract; the contract never recorded it, so no one can withdraw it, and the E2E counts it explicitly.

Earlier deployment (v1.0.0, before approved sources): `0x8A74b9521C9adD0B408E25d73B0614bdacac3f84`.

## Which page counts

- **Approved sources only.** The owner (the deployer) keeps a registry of
  hosts that publish cancellations for events: a venue's or league's own
  domain, under a name buyers see (`get_sources`). A page must be `https://`
  on an approved host or one of its subdomains, with no user name or port.
  Any other page, such as an organizer's own site, a look-alike domain or a
  host that merely contains an approved name, is refused before it is read,
  so it can never open refunds or release money. Withdrawing a host only
  stops new listings.
- **The exact event.** The organizer gives the event number the page prints
  (ticket or fixture number). Every reading, at listing, `check` and
  `release`, must find that number on the page as a whole token; a page that
  does not show it reverts ("the page does not show event …") and nothing
  moves. The same number on the same source can be listed once, so two
  escrows cannot share one page.

## How the page is read

1. **The official page, whole.** Each validator fetches the URL itself
   (served HTML, no JavaScript). Visible text over 20,000 characters is
   refused at listing, never cut, so a cancellation at the bottom of a long
   page is never missed. A page that cannot be fetched reverts the reading;
   it is never taken as "nothing announced".
2. **One narrow question.** The LLM sees the event's title, number and start
   time and the page, fenced as data, and answers `none`, `cancelled` or `postponed`.
   Rumours, "may be cancelled" and other events on the same page are `none`.
3. **Quoted, then checked by text.** A `cancelled` or `postponed` answer must
   copy the sentence that says so. The contract checks the quote is on the
   page (ignoring case, spacing and markup); a quote that is not there is an
   LLM error and reverts.
4. **Consensus on the status.** Every validator reads the page itself and
   accepts the leader's result only if its own answer is the same status and
   the leader's quote is on its own copy. An unreachable page is agreed on only
   when a validator reproduces the error; an LLM error never is.
5. **Listing reads first.** A page that already announces a cancellation or
   postponement cannot be listed, so a reading that later says so is news.

## Where the money goes

- Ticket money stays in the contract from `buy` until it leaves one way:
  - **refund** to the buyer (price × seats), sent by anyone, once the event is
    `CANCELLED` or `POSTPONED`, or if it is still `ON` 30 days after its hold
    ended (nobody released it, for example because the page went away).
  - **release** to the organizer, for every seat not refunded, after
    `starts_at + hold_hours` and one last reading that still finds nothing.
- Postponed counts as called off: a buyer takes the money back rather than a
  new date they may not be able to make.
- The organizer cannot buy their own seats; sales close at the start or when
  the event is called off. 1–10 seats per purchase, `price × count` exactly.
- Each paying transaction has one payee.

## Payments and settlement

Every transfer is a recorded payout (with its sender and creation time). A
payout is judged by its own transfer, never by the contract balance:
`settle_payout(payout_id, tx_hash, finalize_tx)` has validators read the paying
transaction (it must be this contract's `refund` for that ticket, its
`release` for that event or a `recover`, sent by the recorded sender at the
recorded time, and finalized with a successful result) and the consensus
transaction that finalized it, and check that the transfer to the payee was
executed. Delivered payouts are `DELIVERED`; a failed one is `FAILED` and its
amount becomes recoverable by the payee, who sends it anywhere with `recover`.
`get_accounting` (balance vs. `expected_balance`) is informational only.

## Limits

- The page decides, and the owner decides which hosts may be that page. The
  registry is only as trustworthy as the owner; buyers see the source's name
  before paying. If nobody can release the money (for example the page goes
  away), buyers get it back 30 days after the hold.
- Pages are fetched as served; a page built by JavaScript reads as empty text
  and is likely to be read as `none`.
- A cancellation posted after the release is too late: the organizer was paid.
  The hold (1–720 hours after the start) is the organizer's promise of how long
  buyers have to see it.

## The app

https://refundwatch.cristhedev.com ([`app/`](app/)) reads the **finalized**
state and treats a write as done only when it is `FINALIZED` with
`FINISHED_WITH_RETURN` **and** reading the contract back shows the change.
Each event shows its official page, escrow, the time the organizer can be
paid, every reading with its quote, and its tickets. Buy appears before the
start with the seats left; release only after the hold; a refund button per
held ticket only once the event is called off or the money lapsed; cancel only
for the organizer. GEN amounts use BigInt only. "Settle" finds the paying
transaction and looks up its finalization from the `TransactionFinalized` log.
`node app/check-actions.mjs app/index.html` (CI) asserts the controls per role,
event state and time, escaping, and exact money formatting.

## API

| Method | Who | Notes |
|---|---|---|
| `set_source(host, name)` | owner | approve a host (and subdomains); empty name withdraws it |
| `list_event(title, ref, url, starts_at, price, capacity, hold_hours)` | organizer | url on an approved host; `ref` 4–40 chars, shown on the page, once per source; start within a year; price > 0; capacity 1–1,000; hold 1–720 h; reads the page |
| `buy(event_id, count)` payable | anyone but the organizer | before the start, 1–10 seats, exactly `price × count` |
| `check(event_id)` | anyone | reads the page; returns the status |
| `cancel(event_id)` | organizer | every ticket refundable |
| `refund(ticket_id)` | anyone | pays the buyer; called off, or `ON` past `lapse_at` |
| `release(event_id)` | anyone | after `release_at`; reads the page; pays the organizer if still nothing |
| `settle_payout(payout_id, tx_hash, finalize_tx)` / `recover(to)` | anyone / payee | |
| `get_event`, `get_events(start, limit)`, `get_ticket`, `get_tickets(event_id or -1, buyer or "", start, limit)`, `get_readings(event_id, start, limit)`, `get_payout`, `get_payouts(start, limit, only_unsettled)`, `get_accounting`, `get_recoverable`, `get_sources` | view | |

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
genvm-lint check contracts/refund_watch.py
pytest tests/direct -v                         # 45 tests
# end-to-end on Bradbury Phase 2, against the packed code (keys in GL_PK0..2)
python deploy/shrink.py contracts/refund_watch.py build/refund_watch.py --pack
npm i genlayer-js@2.0.0-rc.2   # plus the fee-estimate patch in app/README.md
node tests/integration/bradbury.mjs build/refund_watch.py
```

Bradbury rejects deploys above ~20 KB of code; deploy the output of
`deploy/shrink.py` (AST-checked, 34.7 KB → 9.3 KB packed). CI re-runs all
direct tests against the packed code. The E2E pages are in
[`evidence/`](evidence/), served at `https://refundwatch.cristhedev.com/evidence/`;
the Spring Gala page is replaced by `spring-gala-cancelled.html` mid-run.

## Tests (45 direct, Bradbury E2E)

- **Sources and event numbers** — an organizer-controlled page, a look-alike or parent domain, user-info, a port or plain http are refused before reading; a subdomain of an approved host is accepted; only the owner approves sources; a page that does not show the event number cannot list, open refunds or release (leader reverts, validators disagree); one listing per number and source.
- **Listing and buying** — validation of title, event number, url, start, price, capacity and hold; a page already announcing a cancellation cannot be listed; exact payment, seat cap, no buying by the organizer or after the start.
- **The page decides** — nothing refundable while the page says nothing; a reading that finds nothing changes nothing; cancelled and postponed both open refunds and close sales; a quote that is not on the page reverts.
- **Organizer** — only the organizer cancels; release refused before the hold ends (to the second), pays every unrefunded seat after it, and reads the page one last time (a late cancellation refunds buyers instead).
- **Lapse** — money never released goes back to buyers after 30 days (boundary to the second); no payout beyond the contract balance.
- **Consensus (validator replay)** — agreement on the status, the quote must be on each validator's own copy (case and spacing ignored), an unreachable page is agreed and reverts, an LLM error is never agreed.
- **Settlement** — delivered and failed refunds, recovery to another address; wrong method, args, sender, time, result, or a transaction that sent nothing are rejected and the payout stays `SENT`.
- **App** — `check-actions.mjs`: controls per role, event state and time, refund amounts per ticket, escaping, exact GEN amounts beyond 2^53.

## License

MIT
