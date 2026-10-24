export type GraphicsMode='high'|'balanced'|'low';
export function graphicsSettings(mode:GraphicsMode):{quality:'high'|'balanced';lowPower:boolean}{return{quality:mode==='high'?'high':'balanced',lowPower:mode==='low'};}
export function restoredGraphicsMode(value:unknown,legacyQuality?:unknown,legacyLow?:unknown):GraphicsMode{if(value==='high'||value==='balanced'||value==='low')return value;return legacyLow===true?'low':legacyQuality==='high'?'high':'balanced';}
