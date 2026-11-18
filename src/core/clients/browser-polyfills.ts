/* eslint-env es2020 */
import { Buffer } from 'buffer';
import process from 'process';

// node-poweredup uses Buffer globally, including during Bluetooth discovery.
globalThis.Buffer = Buffer;
globalThis.process = process;
