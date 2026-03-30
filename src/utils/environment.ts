/**
 * Purpose: Shared environment type for identity and T3N configuration
 * Scope:   Single source of truth for Environment literal union
 * Inputs:  N/A (type only)
 * Outputs: Environment type export
 */

export type Environment = "local" | "testnet" | "mainnet";
