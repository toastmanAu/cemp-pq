# CEMP-PQ

CKB Post-Quantum Encrypted Messaging Protocol.

This project implements a post-quantum messaging protocol on the Nervos CKB blockchain using:
- **ML-DSA-65**: For post-quantum identity signatures and transaction authorization.
- **ML-KEM-768**: For secure key encapsulation and encrypted message payloads.

## Protocol Phases

### Phase 0: Profile Creation
Users deploy a **Profile Cell** containing their ML-DSA and ML-KEM public keys and optional metadata, serialized using the Molecule format. This serves as their on-chain discoverable identity.

### Phase 1: Encrypted Message Publication
To send a message, the sender:
1. Discovers the recipient's ML-KEM public key from their Profile Cell.
2. Encapsulates a shared symmetric key using ML-KEM.
3. Encrypts the message using the derived symmetric key.
4. Publishes a **Message Cell** (readable by the recipient) and a **Notification Cell** pointing to the message.

---

## Installation & Testing

### Installation

```bash
npm install
```

### Running Tests

To run the transaction builder test suite:
```bash
node test-builder.js
```

To run the live on-chain test on CKB Testnet (requires a funded ML-DSA lock address):
```bash
node live-test.js
```
