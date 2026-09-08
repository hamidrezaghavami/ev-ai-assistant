import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
// 🛠️ FIX: Import SafeAreaView from the modern context package
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech'; 

const MAINFRAME_IP = '192.168.1.105';
const WS_URL = `ws://${MAINFRAME_IP}:8080`;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState(['[SYSTEM INITIALIZED - BND READY]']);
  const [inputText, setInputText] = useState('');
  const socketRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // 💬 Catch the transcript and render it to the tactical log
        if (data.type === 'transcript' && data.text) {
          setLogs((prev) => [...prev.slice(-20), `E.V.: ${data.text}`]);
          Speech.speak(data.text);
        }
      } catch (err) {
        console.error('WS Parse Error:', err);
      }
    };

    return () => ws.close();
  }, []);

  const triggerOSINT = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'osint_trigger', target: 'TargetCompany' }));
      setLogs((prev) => [...prev.slice(-20), `[OSINT INITIATED - TARGET LOCKED]`]);
    }
  };

  const handleSend = () => {
    if (inputText.trim() && socketRef.current?.readyState === WebSocket.OPEN) {
      Speech.stop();
      setLogs((prev) => [...prev.slice(-20), `YOU: ${inputText}`]);
      socketRef.current.send(JSON.stringify({ type: 'prompt', text: inputText }));
      setInputText(''); 
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* TACTICAL HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ALERT: SYSTEM READY</Text>
          <Text style={[styles.statusText, { color: connected ? '#00FF66' : '#FF1A1A' }]}>
            {connected ? 'LINK: ONLINE' : 'LINK: OFFLINE'}
          </Text>
          
          {/* 🎯 OSINT TRIGGER BUTTON */}
          <TouchableOpacity activeOpacity={0.7} onPress={triggerOSINT} style={styles.osintButton}>
            <Text style={styles.buttonText}>INITIATE OSINT</Text>
          </TouchableOpacity>
        </View>

        {/* RADAR / LOG VIEWER */}
        <ScrollView style={styles.terminalContainer}>
          {logs.map((log, index) => (
            <Text key={index} style={styles.terminalText}>{log}</Text>
          ))}
        </ScrollView>

        {/* INPUT CONSOLE */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type command..."
            placeholderTextColor="rgba(255, 26, 26, 0.5)"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity activeOpacity={0.7} onPress={handleSend} style={styles.sendButton}>
            <Text style={styles.buttonText}>TX</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505', padding: 16 },
  header: { borderWidth: 1, borderColor: '#FF1A1A', padding: 10, marginTop: 10, marginBottom: 10, backgroundColor: 'rgba(255, 26, 26, 0.05)' },
  headerTitle: { color: '#FF1A1A', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 16, letterSpacing: 1.5 },
  statusText: { fontFamily: 'monospace', fontSize: 12, marginTop: 4, marginBottom: 10 },
  osintButton: { backgroundColor: '#8B0000', padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FF1A1A' },
  terminalContainer: { flex: 1, borderWidth: 1, borderColor: 'rgba(255, 26, 26, 0.3)', backgroundColor: 'rgba(0, 0, 0, 0.7)', padding: 10, marginBottom: 15 },
  terminalText: { color: '#FF4D4D', fontFamily: 'monospace', fontSize: 13, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  textInput: { flex: 1, height: 50, borderWidth: 1, borderColor: '#FF1A1A', color: '#FFF', fontFamily: 'monospace', paddingHorizontal: 15, backgroundColor: 'rgba(255, 26, 26, 0.1)' },
  sendButton: { height: 50, width: 60, backgroundColor: '#FF1A1A', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  buttonText: { color: '#FFF', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 14 },
});