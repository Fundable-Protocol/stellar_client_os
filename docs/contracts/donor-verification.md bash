## Anonymous Donor Verification (ZK-style eligibility)

`contracts/donor-verification` implements donor eligibility verification
via a Merkle-commitment + nullifier scheme — the same privacy primitive
used by systems like Tornado Cash — rather than a full zk-SNARK circuit
(which would require pairing-curve arithmetic and a trusted setup beyond
this contract's scope).

- Donors are enrolled off-chain as commitments (`hash(secret, nullifier)`)
  and included as leaves in a Merkle tree; only the tree's root is
  published on-chain via `update_root`.
- To donate, a donor calls `verify_and_donate` with a Merkle inclusion
  proof for their leaf. Their account address is authorized via
  `require_auth()` but is never linked on-chain to their commitment.
- Only the nullifier (not the secret or the leaf) is revealed and
  recorded, preventing the same enrolled identity from being used twice.
- A true Groth16/PLONK SNARK verifier could later replace the Merkle
  proof check behind the same `verify_and_donate` entry point if
  stronger unlinkability guarantees are required.