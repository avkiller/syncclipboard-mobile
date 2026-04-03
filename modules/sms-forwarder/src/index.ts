import { Platform } from 'react-native';
import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

const MODULE_NAME = 'SmsForwarderModule';

interface SmsForwarderModuleType {
  startListening(): void;
  stopListening(): void;
  isListening(): boolean;
  readRecentSms(count: number): SmsMessage[];
  addListener(eventName: string, listener: (event: SmsReceivedEvent) => void): EventSubscription;
}

export interface SmsReceivedEvent {
  from: string;
  body: string;
}

export interface SmsMessage {
  from: string;
  body: string;
}

const NativeModule: SmsForwarderModuleType | null =
  Platform.OS === 'android' ? requireNativeModule(MODULE_NAME) : null;

export function startListening(): void {
  if (NativeModule) {
    NativeModule.startListening();
  }
}

export function stopListening(): void {
  if (NativeModule) {
    NativeModule.stopListening();
  }
}

export function isListening(): boolean {
  if (NativeModule) {
    return NativeModule.isListening();
  }
  return false;
}

export function addSmsListener(
  listener: (event: SmsReceivedEvent) => void
): EventSubscription | null {
  if (NativeModule) {
    return NativeModule.addListener('onSmsReceived', listener);
  }
  return null;
}

export function readRecentSms(count: number): SmsMessage[] {
  if (NativeModule) {
    return NativeModule.readRecentSms(count);
  }
  return [];
}
