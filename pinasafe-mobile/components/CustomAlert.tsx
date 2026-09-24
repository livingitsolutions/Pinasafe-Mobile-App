import React, { useEffect, useState } from "react";
import { View, Text, Modal, TouchableOpacity, Animated, StyleSheet } from "react-native";
import { CheckCircle, XCircle, AlertCircle, Info } from "lucide-react-native";

type AlertType = "success" | "error" | "warning" | "info";

interface CustomAlertProps {
  visible: boolean;
  type?: AlertType;
  title: string;
  message?: string;
  confirmText?: string;
  onConfirm?: () => void;
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  type = "info",
  title,
  message,
  confirmText = "OK",
  onConfirm,
}) => {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    setShow(visible);
  }, [visible]);

  const handleConfirm = () => {
    setShow(false);
    onConfirm?.();
  };

  const Icon = icons[type];

  return (
    <Modal transparent visible={show} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Icon size={48} color={getColor(type)} style={{ marginBottom: 12 }} />
          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}
          <TouchableOpacity style={[styles.button, { backgroundColor: getColor(type) }]} onPress={handleConfirm}>
            <Text style={styles.buttonText}>{confirmText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const getColor = (type: AlertType) => {
  switch (type) {
    case "success":
      return "#22c55e"; // green
    case "error":
      return "#dc2626"; // red
    case "warning":
      return "#f59e0b"; // orange
    case "info":
    default:
      return "#2563eb"; // blue
  }
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: "white",
    padding: 24,
    borderRadius: 16,
    width: "80%",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
    color: "#4b5563",
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});
