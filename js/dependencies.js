import * as zipjs from '@zip.js/zip.js';
import { ESPLoader, Transport } from 'esptool-js';
import SparkMD5 from 'spark-md5';

globalThis.Buffer = Object.freeze({
    from(value, inputEncoding) {
        if (inputEncoding !== 'base64') {
            throw new Error('Unsupported input encoding');
        }
        return Object.freeze({
            toString(outputEncoding) {
                if (outputEncoding !== 'binary') {
                    throw new Error('Unsupported output encoding');
                }
                return atob(value);
            }
        });
    }
});
zipjs.configure({ useWebWorkers: false });
window.zipjs = zipjs;
window.esptooljs = { ESPLoader, Transport };
window.SparkMD5 = SparkMD5;
