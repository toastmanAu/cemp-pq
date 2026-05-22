# CEMP-PQ

CKB Post-Quantum Encrypted Messaging Protocol.

This project implements a post-quantum messaging protocol on the Nervos CKB blockchain using:
- **ML-DSA-65**: For post-quantum identity signatures and transaction authorization.
- **ML-KEM-768**: For secure key encapsulation.
- **AES-256-GCM (AEAD)**: For production-grade authenticated encryption of message payloads, derived via a shared key.
- **Type ID**: CKB's native Type ID system script to ensure Profile Cells have a stable, globally unique on-chain identifier.

## Compatibility

- **CCC Version**: `@ckb-ccc/core@^1.12.0` (fully compatible with the ChainPay integration suite).

## Protocol Phases

### Phase 0: Profile Creation
Users deploy a **Profile Cell** containing their ML-DSA and ML-KEM public keys and optional metadata, serialized using the Molecule format. The Profile Cell is protected by a stable **Type ID** to allow permanent, deterministic discovery.

### Phase 1: Encrypted Message Publication
To send a message, the sender:
1. Discovers the recipient's ML-KEM public key from their Profile Cell using the Type ID script.
2. Encapsulates a shared symmetric key using ML-KEM.
3. Encrypts the message using **AES-256-GCM** via the Web Crypto API.
4. Publishes a **Message Cell** (owned by the sender) and a **Notification Cell** (owned by the recipient) pointing to the message.

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
