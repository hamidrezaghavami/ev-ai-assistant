import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

// YOUR MACBOOK'S WI-FI IP (Check on Mac with: ipconfig getifaddr en0)
const MAINFRAME_IP = '192.168.1.50'; 
const WS_URL = `ws://${MAINFRAME_IP}:8080`;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState(['[SYSTEM INITIALIZED - BND READY]']);
  const [spokenText, setSpokenText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    ExpoSpeechRecognitionModule.requestPermissionsAsync();

    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.text) {
          setLogs((prev) => [...prev.slice(-20), `E.V.: ${msg.text}`]);
        }
      } catch (err) {
        setLogs((prev) => [...prev.slice(-20), `RAW: ${e.data}`]);
      }
    };

    return () => ws.close();
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    setSpokenText(event.results[0]?.transcript || '');
  });

  const handlePressIn = async () => {
    setSpokenText('');
    setIsRecording(true);
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
    });
  };

  const handlePressOut = async () => {
    setIsRecording(false);
    ExpoSpeechRecognitionModule.stop();

    if (spokenText.trim() && socketRef.current?.readyState === WebSocket.OPEN) {
      setLogs((prev) => [...prev.slice(-20), `YOU: ${spokenText}`]);
      socketRef.current.send(JSON.stringify({ type: 'prompt', text: spokenText }));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* TACTICAL HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ALERT: SYSTEM READY</Text>
        <Text style={[styles.statusText, { color: connected ? '#00FF66' : '#FF1A1A' }]}>
          {connected ? 'LINK: ONLINE' : 'LINK: OFFLINE'}
        </Text>
      </View>

      {/* RADAR / LOG VIEWER */}
      <ScrollView style={styles.terminalContainer}>
        {logs.map((log, index) => (
          <Text key={index} style={styles.terminalText}>{log}</Text>
        ))}
      </ScrollView>

      {/* ACTIVE SPEECH PROJECTION */}
      <View style={styles.speechBox}>
        <Text style={styles.transcriptionText}>
          {spokenText ? spokenText : isRecording ? 'Listening...' : 'Hold to Speak'}
        </Text>
      </View>

      {/* PUSH-TO-TALK BUTTON */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.pttButton, isRecording && styles.pttButtonActive]}
      >
        <Text style={styles.buttonText}>{isRecording ? 'TRANSMITTING' : 'PUSH TO TALK'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    padding: 16,
  },
  header: {
    borderWidth: 1,
    borderColor: '#FF1A1A',
    padding: 10,
    marginTop: 24,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 26, 26, 0.05)',
  },
  headerTitle: {
    color: '#FF1A1A',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1.5,
  },
  statusText: {
    fontFamily: 'monospace',
    fontSize: 12,
    marginTop: 4,
  },
  terminalContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 26, 26, 0.3)',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
    marginBottom: 10,
  },
  terminalText: {
    color: '#FF4D4D',
    fontFamily: 'monospace',
    fontSize: 13,
    marginBottom: 6,
  },
  speechBox: {
    height: 60,
    borderWidth: 1,
    borderColor: '#FF1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  transcriptionText: {
    color: '#FFF',
    fontFamily: 'monospace',
    fontSize: 14,
  },
  pttButton: {
    height: 55,
    borderWidth: 2,
    borderColor: '#FF1A1A',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pttButtonActive: {
    backgroundColor: '#FF1A1A',
  },
  buttonText: {
    color: '#FFF',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
});