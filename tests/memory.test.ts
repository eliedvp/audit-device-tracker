import { MemoryStorage } from '../src/adapters/storage/memory.js';
import { runStorageContract } from './storage-contract.js';

runStorageContract('MemoryStorage', () => new MemoryStorage());