import { Server } from '@stellar/stellar-sdk/rpc';
const server = new Server('https://soroban-testnet.stellar.org', { allowHttp: true });
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(server)));
