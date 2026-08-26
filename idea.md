# Chorus

A scam report that nobody can read until someone else independently makes the same one.

---

## The problem

When someone is defrauded through a payment handle — a UPI ID, a wallet address, a phone number attached to a payment app — the single most useful fact in the world is that other people were defrauded through the same handle. That fact is what turns a lone complaint into a case. It is what tells the fourth person about to pay that handle to stop.

That fact almost never surfaces in time.

Reporting is structured so that the first person to report bears the entire cost and receives nothing. They carry the embarrassment of having been fooled, they hand their identity and the amount they lost to a portal or a police station, and in return they get a complaint number. Nobody tells them whether anyone else reported the same handle, because nobody knows. The aggregation, when it happens at all, happens by accident and late: five separate victims in Amritsar had their complaints merged into one FIR only after investigators noticed, by hand, that the modus operandi matched.

So the sequence that would actually help — *report, discover you are not alone, act together* — is inverted. You report into silence and hope.

The obvious fix is a public scam blacklist. Every version of it fails for the same two reasons. A public list of accused handles is a defamation and extortion surface: one anonymous submission and a small merchant's payment handle is poisoned, with no recourse. And a list that requires accounts to prevent that abuse becomes a registry of who reported whom, which is exactly the exposure people were avoiding when they stayed silent.

## The insight

The thing people need from a scam database is not the ability to browse it. It is the ability to ask one specific question about one specific handle they already know: *has anyone else been hit by this?*

Nobody needs to read the whole list. A victim knows the handle that took their money. A person about to send money knows the handle they are about to send it to. In both cases the query is already in their hand.

That changes what the database has to be. It does not have to be readable. It only has to be *queryable by someone who already knows the answer's key* — and unreadable to everyone else, including the people running it.

Which means the register can be a public ledger of opaque commitments. If you know the handle, you can derive its commitment locally and read its count in the open. If you don't, the ledger is a wall of meaningless hashes and a set of counters attached to nothing. There is no list to scrape, no list to leak, no list to subpoena, no list to weaponise against a merchant, because there is no list — only the ability to confirm what you already suspected.

## What it is

Chorus is a public register of scam reports where the register itself is unreadable, and the only thing anyone can do with it is confirm a handle they already have.

Two actions, and they are deliberately asymmetric.

**Report** is a transaction. You enter the handle that took your money. Your device derives a commitment to that handle and a nullifier unique to you-and-that-handle, proves in zero knowledge that both were derived correctly from a handle you hold and a secret only you hold, and publishes only those two 32-byte values. The commitment's counter goes up by one. The nullifier is recorded so that you cannot inflate that counter by reporting the same handle twice, even though nothing on chain knows who you are or how many handles you've reported.

**Check** is free, instant, and involves no transaction at all. You enter the handle you're about to pay. Your device derives the same commitment locally — same handle, same commitment, always — and reads the counter off the public ledger. No account, no request to any server that could log the query, no on-chain footprint. The check is a local hash and a public read.

The report side is what makes the register trustworthy. The check side is what makes it useful. Neither works without the other, and neither works if the ledger is readable.

### The threshold

Each commitment carries a count and a match flag. Below the threshold, a count means nothing to anyone but the people holding that handle. At the threshold — three independent reports, three distinct nullifiers — the commitment is flagged as matched.

The flag does not release a name, an amount, or a report. It releases exactly one bit of information, and only to people who can already derive the commitment: *you are not the only one.* Three strangers who have never communicated, who cannot identify each other, and who did not know the others existed, simultaneously learn that they were hit by the same operator.

That is the entire product. The threshold makes the first report cost nothing, because it discloses nothing until it stops being the first.

### What is public and what is never public

Public, permanently, for anyone: a set of 32-byte commitments, a count for each, a set of 32-byte nullifiers, a match flag.

Never public, at any point, to anyone: the payment handle. The amount lost. The reporter's identity, wallet, or secret. Which nullifiers belong to the same person. How many handles any one person has reported. The narrative of what happened.

An observer with a full copy of the chain and unlimited compute learns that some handle received three reports. They do not learn which handle, from whom, or for how much.

## Why this needs Midnight specifically

Strip the chain out and the design collapses in a way that is easy to state: a server could compute the same commitments, but the reason nobody reports is that they do not trust the collector. A server that can see queries can log them. A server that holds the register can be compelled to hand it over, breached, or quietly sold. "Trust us, we only store hashes" is a promise, and the entire population this is built for has already learned what those promises are worth.

Midnight is load-bearing for three specific reasons, not as a venue:

**Private witness state.** The handle and the reporter's secret are witnesses — supplied by the local runtime, never transmitted, structurally incapable of reaching the chain. Correctness of the derivation is proven rather than trusted.

**Explicit disclosure.** The commitment and nullifier are the only values marked disclosed. Every other value in the circuit is private by construction, and the compiler refuses to build a contract that leaks one by accident. The privacy guarantee is a compile-time property of the contract, not a claim in a privacy policy.

**A public ledger nobody has to be trusted to keep.** The register has to be publicly readable for the free client-side check to work without a server, and simultaneously has to reveal nothing. Opaque commitments on an open ledger is the only shape that satisfies both.

## The honest weaknesses

**The commitment space is grindable.** A handle is not high-entropy. An attacker who enumerates plausible UPI IDs and derives their commitments can discover which handles carry reports. This is the real limitation and it is not hidden: what the system protects perfectly is the reporter, and what it protects imperfectly is the target. The production answer is a distributed pepper or threshold decryption held by parties who must cooperate to grind, plus rate-limited derivation. The hackathon build ships domain-separated commitments and names the gap.

**Reports are unverified.** The circuit proves the derivation was correct, not that a scam occurred. Three colluding accounts can flag an innocent handle. The threshold raises the cost of that attack and the absence of any public list limits its payoff — you cannot smear a merchant on a register nobody can read — but the design does not claim to establish truth. It establishes independent coincidence, which is a weaker and more honest claim.

**One bit is not a case.** Knowing three people were hit does not recover anyone's money. It changes what those three people do next, and what the fourth person does before paying. That is the whole ambition.

## What it deliberately is not

Not a scam-reporting portal with a nicer form. Not a blacklist, a browsable directory, or a feed. Not an identity or KYC system. Not an escrow, an insurer, or a recovery service. Not a police integration. Not a chat between matched victims — matching is the output, and connecting them is a different product with a different threat model.

## The generalisation

The mechanism is not about scams. It is a primitive: **hold a claim in escrow until enough people independently make the same one, without any of them revealing the claim or themselves.**

The same deployed contract, given a different commitment domain, is a harassment register for a workplace where the first complainant is the one who gets fired, a landlord register where tenants can't afford to be identified, a counterfeit-supplier register between competing shops, a bad-client register among freelancers. Same contract, same threshold, different domain string. The scam case is the one that is easiest to feel in thirty seconds — it is not the boundary of the idea.
