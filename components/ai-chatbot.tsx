import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from "expo-constants";
import { OpenAI } from "openai";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions, KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

const { width, height } = Dimensions.get('window');

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface AIChatbotProps {
  style?: any;
  messages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
  events?: any[]; // optional list of current events (from Firestore)
  onClose?: () => void;
  fullscreen?: boolean; // render as a full page instead of compact modal
  keyboardOffset?: number; // keyboardVerticalOffset for KAV when fullscreen
}

const systemPrompt = `You are a helpful AI assistant named TavaBot for a mobile app that manages events and activities.`;

export default function AIChatbot({ style, messages: externalMessages, onMessagesChange, events, onClose, fullscreen = false, keyboardOffset }: AIChatbotProps) {
  const [internalMessages, setInternalMessages] = useState<Message[]>([]);
  const messages = externalMessages ?? internalMessages;

  // Keep a ref with the latest conversation so we can append reliably even
  // if the parent prop hasn't updated yet (avoids race conditions).
  const conversationRef = useRef<Message[]>(messages);

  // Sync ref whenever messages change from props or internal state
  useEffect(() => {
    conversationRef.current = messages;
  }, [messages]);

  // If external messages are not provided and we have internalMessages empty,
  // keep internal state. If externalMessages is provided, don't overwrite it.
  useEffect(() => {
    if (!externalMessages && internalMessages.length === 0) {
      setInternalMessages([]);
    }
  }, [externalMessages]);

  const updateMessages = (updater: (prev: Message[]) => Message[]) => {
    // use the ref as the single source of truth for building the next state
    const prev = conversationRef.current ?? (externalMessages ?? internalMessages);
    const next = updater(prev);
    conversationRef.current = next;
    if (onMessagesChange) {
      try {
        onMessagesChange(next);
        // Immediately persist as a fallback so messages are saved even if
        // the parent state update hasn't propagated to AsyncStorage yet.
        (async () => {
          try {
            await AsyncStorage.setItem('chatMessages_v1', JSON.stringify(next));
          } catch (e) {
            // ignore
          }
        })();
      } catch (e) {
        // ignore
      }
    } else {
      setInternalMessages(next);
    }
  };
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const openai = new OpenAI({ apiKey: Constants?.expoConfig?.extra?.openAIKey });

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

  // Add the user message to the conversation immediately and use that
  const newMessages = [...(conversationRef.current ?? []), userMessage];
  updateMessages(() => newMessages);
  console.log('AIChatbot: sent userMessage', userMessage, 'newMessages length', newMessages.length);
  setInputText("");
  setIsLoading(true);

    try {
      // Build messages for the model. Start with the system prompt.
      const modelMessages: any[] = [{ role: "system" as const, content: systemPrompt }];

  // If events prop was provided, attach a concise summary as additional system context.
  const eventsList = events;

      // Build the conversation messages including the new user message.
      const convoMessages = newMessages.map((m) => ({
        role: (m.isUser ? "user" : "assistant") as "user" | "assistant",
        content: m.text,
      }));

      if (Array.isArray(eventsList) && eventsList.length > 0) {
        const maxEvents = 8;
        const slice = eventsList.slice(0, maxEvents);
        const summary = slice
          .map((ev, idx) => {
            const type = ev?.eventType ?? ev?.title ?? 'Event';
            const ppl = ev?.numPeople ?? ev?.attendees ?? 'unknown';
            const lat = ev?.location?.latitude ?? (ev?.location?.lat ?? 'n/a');
            const lng = ev?.location?.longitude ?? (ev?.location?.lon ?? 'n/a');
            return `${idx + 1}. ${type} — ${ppl} people — location: ${lat}, ${lng}`;
          })
          .join("\n");
        modelMessages.push({ role: "system" as const, content: `Current app events (most recent ${slice.length}):\n${summary}` });
      }

      modelMessages.push(...convoMessages);

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: modelMessages,
        max_tokens: 300,
        temperature: 0.7,
      });

      const aiText =
        completion.choices[0]?.message?.content ||
        "I couldn’t generate a response. Please try again.";

      const aiMessage: Message = {
        id: Date.now().toString() + "-ai",
        text: aiText,
        isUser: false,
        timestamp: new Date(),
      };
      // Append AI message to the latest known conversation (conversationRef)
      updateMessages((prev) => [...(conversationRef.current ?? prev), aiMessage]);
    } catch (error) {
      console.error("OpenAI API error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Ensure we scroll to the bottom whenever messages change
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    // small timeout to allow layout to update before scrolling
    const t = setTimeout(() => {
      try {
        scrollRef.current?.scrollToEnd({ animated: true });
      } catch (e) {
        // ignore
      }
    }, 50);
    return () => clearTimeout(t);
  }, [messages]);

  const containerStyle = fullscreen ? styles.pageContainer : styles.compactModalContainer;

  return (
    <KeyboardAvoidingView
      style={[containerStyle, style]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={fullscreen ? (keyboardOffset ?? (Platform.OS === 'ios' ? 80 : 0)) : undefined}
    >
      {/* Header */}
      <View style={styles.darkHeader}>
        <Text style={styles.darkHeaderTitle}>TavaBot</Text>
        {typeof onClose === 'function' && (
          <TouchableOpacity onPress={onClose} style={styles.headerClose}>
            <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.darkMessagesContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={{ padding: 12 }}>
            <Text style={{ color: '#aaa', fontSize: 14 }}>No messages yet — ask me anything.</Text>
          </View>
        )}

        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageContainer,
              message.isUser ? styles.userMessage : styles.aiMessage,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                message.isUser
                  ? styles.userMessageText
                  : styles.aiMessageText,
              ]}
            >
              {message.text}
            </Text>
            <Text style={styles.timestamp}>
              {message.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        ))}
        {isLoading && (
          <View style={[styles.messageContainer, styles.aiMessage]}>
            <Text style={styles.loadingText}>AI is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.darkInputContainer}>
        <TextInput
          style={styles.darkTextInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask me anything..."
          placeholderTextColor="#888"
          multiline
          maxLength={500}
          editable={!isLoading}
          onSubmitEditing={sendMessage}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={sendMessage}
          style={[
            styles.sendButton,
            (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
          ]}
          disabled={!inputText.trim() || isLoading}
        >
          <Ionicons name="send" size={Math.max(width * 0.045, 18)} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pageContainer: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  compactModalContainer: {
    flex: 1,
    minHeight: height * 0.35,
    maxHeight: height * 0.6,
    backgroundColor: "#181818",
    borderRadius: width * 0.045,
    padding: 0,
    overflow: "hidden",
    elevation: 8,
    justifyContent: "flex-start",
  },
  darkHeader: {
    paddingHorizontal: width * 0.04,
    paddingVertical: height * 0.015,
    backgroundColor: "#222",
    borderTopLeftRadius: width * 0.045,
    borderTopRightRadius: width * 0.045,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  darkHeaderTitle: {
    fontSize: width * 0.05,
    fontWeight: "600",
    color: "#fff",
    marginTop: 0,
  },
  darkMessagesContainer: {
    flex: 1,
    paddingHorizontal: width * 0.04,
    paddingVertical: height * 0.015,
    backgroundColor: "#181818",
  },
  darkInputContainer: {
    flexDirection: "row",
    paddingHorizontal: width * 0.04,
    paddingVertical: height * 0.015,
    backgroundColor: "#222",
    borderTopWidth: 1,
    borderTopColor: "#333",
    alignItems: "flex-end",
    borderBottomLeftRadius: width * 0.045,
    borderBottomRightRadius: width * 0.045,
  },
  darkTextInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: width * 0.05,
    paddingHorizontal: width * 0.04,
    paddingVertical: height * 0.015,
    marginRight: width * 0.03,
    maxHeight: height * 0.13,
    fontSize: width * 0.045,
    color: "#fff",
    backgroundColor: "#222",
  },
  floatingButton: {
    position: "absolute",
    bottom: 30,
    left: 20,
  },
  chatButton: {
    width: Math.max(width * 0.12, 44),
    height: Math.max(width * 0.12, 44),
    borderRadius: Math.max(width * 0.06, 22),
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  headerClose: {
    position: 'absolute',
    right: width * 0.04,
    top: height * 0.015,
    padding: Math.max(width * 0.01, 6),
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e5e9",
    paddingTop: Platform.OS === "ios" ? 50 : 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    padding: 4,
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
  },
  messageContainer: {
    marginBottom: Math.max(height * 0.015, 10),
    maxWidth: "80%",
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#007AFF",
    borderRadius: Math.max(width * 0.045, 12),
    borderBottomRightRadius: Math.max(width * 0.01, 4),
    padding: Math.max(width * 0.035, 10),
  },
  aiMessage: {
    alignSelf: "flex-start",
    backgroundColor: "white",
    borderRadius: Math.max(width * 0.045, 12),
    borderBottomLeftRadius: Math.max(width * 0.01, 4),
    padding: Math.max(width * 0.035, 10),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: Math.max(width * 0.04, 14),
    lineHeight: Math.max(width * 0.05, 18),
  },
  userMessageText: {
    color: "white",
  },
  aiMessageText: {
    color: "#333",
  },
  timestamp: {
    fontSize: Math.max(width * 0.032, 11),
    color: "#666",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    fontStyle: "italic",
  },
  inputContainer: {
    flexDirection: "row",
    padding: Math.max(width * 0.03, 12),
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#e1e5e9",
    alignItems: "flex-end",
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    borderRadius: Math.max(width * 0.04, 14),
    paddingHorizontal: Math.max(width * 0.03, 12),
    paddingVertical: Math.max(height * 0.01, 10),
    marginRight: Math.max(width * 0.03, 12),
    maxHeight: Math.max(height * 0.12, 100),
    fontSize: Math.max(width * 0.04, 14),
  },
  sendButton: {
    width: Math.max(width * 0.09, 36),
    height: Math.max(width * 0.09, 36),
    borderRadius: Math.max(width * 0.045, 18),
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#ccc",
  },
});
