/**
 * Minimal type declarations for @railgun-community/circomlibjs.
 *
 * Only the subset used by Merlin's Railgun integration is declared here:
 *   - poseidon: Poseidon hash function
 *   - eddsa: EdDSA on BabyJubJub curve (prv2pub)
 */
declare module "@railgun-community/circomlibjs" {
  export function poseidon(inputs: bigint[]): bigint;

  export const eddsa: {
    prv2pub(privateKey: Uint8Array | Buffer): [bigint, bigint];
    signPoseidon(privateKey: Uint8Array | Buffer, message: bigint): Signature;
    verifyPoseidon(
      message: bigint,
      signature: Signature,
      pubkey: [bigint, bigint]
    ): boolean;
  };

  export interface Signature {
    R8: [bigint, bigint];
    S: bigint;
  }
}
