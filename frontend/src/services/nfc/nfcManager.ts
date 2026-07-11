import { Platform } from 'react-native';

export class WebNFCService {
  async initialize(): Promise<void> {}
  async writeToCard(tokenNumber: string): Promise<boolean> {
    console.warn('NFC Writing is not supported on Web.');
    return false;
  }
  async readCardDetails(): Promise<{ nfcUid: string; tokenNumber: string | null } | null> {
    console.warn('NFC Reading is not supported on Web.');
    return null;
  }
  async readFromCard(): Promise<string | null> {
    console.warn('NFC Reading is not supported on Web.');
    return null;
  }
  async eraseCard(): Promise<boolean> {
    console.warn('NFC Erasing is not supported on Web.');
    return false;
  }
  async cleanup(): Promise<void> {}
}

let serviceInstance: any;

if (Platform.OS === 'web') {
  serviceInstance = new WebNFCService();
} else {
  // Dynamic require to prevent bundling native imports in browser bundles
  const NfcManager = require('react-native-nfc-manager').default;
  const { NfcTech, Ndef } = require('react-native-nfc-manager');

  class NFCService {
    private static instance: NFCService;
    private isInitialized: boolean = false;

    static getInstance(): NFCService {
      if (!NFCService.instance) {
        NFCService.instance = new NFCService();
      }
      return NFCService.instance;
    }

    async initialize(): Promise<void> {
      if (this.isInitialized) return;
      await NfcManager.start();
      this.isInitialized = true;
    }

    async writeToCard(tokenNumber: string): Promise<boolean> {
      try {
        await NfcManager.requestTechnology(NfcTech.Ndef);
        const bytes = Ndef.encodeMessage([
          Ndef.uriRecord(tokenNumber),
          Ndef.textRecord(tokenNumber)
        ]);
        if (bytes) {
          await NfcManager.ndefHandler.writeNdefMessage(bytes);
          return true;
        }
        return false;
      } catch (error) {
        console.error('NFC write error:', error);
        throw error;
      } finally {
        await NfcManager.cancelTechnologyRequest();
      }
    }

    async readCardDetails(): Promise<{ nfcUid: string; tokenNumber: string | null } | null> {
      try {
        await NfcManager.requestTechnology(NfcTech.Ndef);
        const tag = await NfcManager.getTag();
        const nfcUid = tag && tag.id ? tag.id : '';
        let tokenNumber: string | null = null;
        if (tag && tag.ndefMessage && tag.ndefMessage.length > 0) {
          const record = tag.ndefMessage[0];
          if (record.payload) {
            const payloadArray = new Uint8Array(record.payload);
            if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) {
              tokenNumber = Ndef.text.decodePayload(payloadArray);
            } else if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI)) {
              tokenNumber = Ndef.uri.decodePayload(payloadArray);
            } else {
              const text = Ndef.util.bytesToString(record.payload);
              tokenNumber = text.replace(/^[\x00-\x1f]+[a-zA-Z]*/, '');
            }
          }
        }
        return { nfcUid, tokenNumber };
      } catch (error) {
        console.error('NFC read details error:', error);
        throw error;
      } finally {
        await NfcManager.cancelTechnologyRequest();
      }
    }

    async readFromCard(): Promise<string | null> {
      try {
        await NfcManager.requestTechnology(NfcTech.Ndef);
        const tag = await NfcManager.ndefHandler.getNdefMessage();
        if (tag && tag.ndefMessage && tag.ndefMessage.length > 0) {
          const record = tag.ndefMessage[0];
          if (record.payload) {
            const payloadArray = new Uint8Array(record.payload);
            if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) {
              return Ndef.text.decodePayload(payloadArray);
            } else if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI)) {
              return Ndef.uri.decodePayload(payloadArray);
            } else {
              const text = Ndef.util.bytesToString(record.payload);
              return text.replace(/^[\x00-\x1f]+[a-zA-Z]*/, '');
            }
          }
        }
        return null;
      } catch (error) {
        console.error('NFC read error:', error);
        throw error;
      } finally {
        await NfcManager.cancelTechnologyRequest();
      }
    }

    async eraseCard(): Promise<boolean> {
      try {
        await NfcManager.requestTechnology(NfcTech.Ndef);
        await NfcManager.ndefHandler.writeNdefMessage([]);
        return true;
      } catch (error) {
        console.error('NFC erase error:', error);
        return false;
      } finally {
        await NfcManager.cancelTechnologyRequest();
      }
    }

    async cleanup(): Promise<void> {
      this.isInitialized = false;
    }
  }

  serviceInstance = NFCService.getInstance();
}

export const nfcService = serviceInstance;
export default nfcService;
