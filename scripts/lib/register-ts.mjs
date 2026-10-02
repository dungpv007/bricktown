// `node --import ./scripts/lib/register-ts.mjs` : see ts-hooks.mjs.
import { register } from 'node:module'

register('./ts-hooks.mjs', import.meta.url)
