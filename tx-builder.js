/**
 * CEMP-PQ Transaction Builder
 */

import { CEMPPQ, ML_DSA_TESTNET, serializeMessagePointer, serializeProfile, signingMessage, buildWitness } from './index.js';
import { ccc } from '@ckb-ccc/core';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';

/**
 * Custom CCC Signer for ML-DSA-65
 */
export class MLDSASigner extends ccc.Signer {
    constructor(client, secretKey, publicKey) {
        super(client);
        if (secretKey.length === 32) {
            const keys = ml_dsa65.keygen(secretKey);
            this.secretKey = keys.secretKey;
            this.publicKey = keys.publicKey;
        } else {
            this.secretKey = secretKey;
            this.publicKey = publicKey;
        }
        
        // Derive lock args
        const pubkeyHash = ccc.bytesFrom(ccc.hashCkb(this.publicKey));
        const args = new Uint8Array(36);
        args[0] = 0x01; // version
        args[1] = 0x02; // algo_id
        args[2] = 0x02; // param_id
        args[3] = 0x00;
        args.set(pubkeyHash, 4);

        this.script = {
            codeHash: ML_DSA_TESTNET.CODE_HASH,
            hashType: ML_DSA_TESTNET.HASH_TYPE,
            args: ccc.hexFrom(args),
        };
    }

    async getAddressObjs() {
        return [await ccc.Address.fromScript(this.script, this.client)];
    }

    async getRecommendedAddressObj() {
        return (await this.getAddressObjs())[0];
    }

    get type() { return ccc.SignerType.CKB; }
    get signType() { return ccc.SignerSignType.Unknown; }
    async isConnected() { return true; }
    async connect() {}

    async prepareTransaction(tx) {
        tx.addCellDeps({
            outPoint: {
                txHash: ML_DSA_TESTNET.TX_HASH,
                index: ML_DSA_TESTNET.INDEX,
            },
            depType: "code",
        });
        // ML-DSA signatures are large (~3300 bytes), we need to reserve space in witnesses
        await tx.prepareSighashAllWitness(this.script, 5300, this.client); // ~5300 for full WitnessArgs with ML-DSA
        return tx;
    }

    async signOnlyTransaction(tx) {
        const hasher = new ccc.HasherCkb();
        const txHash = ccc.bytesFrom(tx.hash());
        const msg = signingMessage(txHash);
        
        const sig = ml_dsa65.sign(this.secretKey, msg, new TextEncoder().encode('CKB-MLDSA-LOCK'));
        const witness = buildWitness(this.publicKey, sig);
        
        tx.setWitnessArgsAt(0, ccc.WitnessArgs.from({
            lock: ccc.hexFrom(witness)
        }));
        
        return tx;
    }
}

export class CEMPTransactionBuilder {
    constructor(client) {
        this.client = client;
    }

    /**
     * Discovery: Fetch the recipient's ML-KEM public key from their Profile Cell.
     */
    async fetchRecipientProfile(recipientLock) {
        // In a real implementation, we search for a cell with a specific Type Script
        // or a specific pattern in the lock args that identifies it as a CEMP-PQ Profile.
        // For now, we simulate the fetch.
        const cells = await this.client.findCells({
            script: recipientLock,
            scriptType: "lock",
            withData: true,
        });

        for await (const cell of cells) {
            // Check if cell data looks like a Molecule Profile table
            // Simplified check: data.length > (1952 + 1184)
            if (cell.outputData.length > 3000) {
                const data = ccc.bytesFrom(cell.outputData);
                const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                const off_kem = view.getUint32(8, true);
                const kemLen = view.getUint32(off_kem, true);
                return data.slice(off_kem + 4, off_kem + 4 + kemLen);
            }
        }
        throw new Error("Recipient profile not found on-chain.");
    }

    /**
     * Phase 0: Create a Profile Cell (One-time setup for users)
     */
    async buildCreateProfileTx(signer, mlDSAPubKey, mlKEMPubKey, metadata = "", feeRate = 1200n) {
        const lock = await signer.getRecommendedAddressObj();
        const profileData = serializeProfile(mlDSAPubKey, mlKEMPubKey, new TextEncoder().encode(metadata));

        const tx = ccc.Transaction.from({
            outputs: [{
                lock: lock.script,
                capacity: ccc.fixedPointFrom(0),
            }],
            outputsData: [ccc.hexFrom(profileData)]
        });

        await tx.completeInputsByCapacity(signer);
        await tx.completeFeeBy(signer, feeRate);
        return tx;
    }

    /**
     * Phase 1: Create Message and Notification Cells
     */
    async buildSendMessageTx(senderSigner, recipientLock, message, feeRate = 1200n) {
        const { script: senderLock } = await senderSigner.getRecommendedAddressObj();
        
        // 1. Discover Recipient's Public Key
        let recipientMLKEMPubKey;
        try {
            recipientMLKEMPubKey = await this.fetchRecipientProfile(recipientLock);
        } catch (e) {
            // Fallback for demo/manual entry if discovery fails
            console.warn("Profile discovery failed, using fallback.");
            recipientMLKEMPubKey = new Uint8Array(1184).fill(0x02); 
        }

        // 2. Encrypt Message
        const encryptedData = CEMPPQ.encrypt(new TextEncoder().encode(message), recipientMLKEMPubKey);

        const tx = ccc.Transaction.from({
            outputs: [
                // Output 1: Message Cell (Owned by Sender)
                {
                    lock: senderLock,
                    capacity: ccc.fixedPointFrom(0), // Will be calculated
                    type: null,
                },
                // Output 2: Notification Cell (Owned by Recipient)
                {
                    lock: recipientLock,
                    capacity: ccc.fixedPointFrom(0), // Will be calculated
                    type: null,
                }
            ],
            outputsData: [
                ccc.hexFrom(encryptedData),
                "0x" // Pointer will be filled after Tx calculation if needed, or just protocol ID
            ]
        });

        // Add CellDeps for ML-DSA
        tx.addCellDeps({
            outPoint: {
                txHash: ML_DSA_TESTNET.TX_HASH,
                index: ML_DSA_TESTNET.INDEX,
            },
            depType: "code",
        });

        // Complete the transaction (find inputs, calculate fees, etc.)
        await tx.completeInputsByCapacity(senderSigner);
        await tx.completeFeeBy(senderSigner, feeRate);

        return tx;
    }
}
