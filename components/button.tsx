import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  useColorScheme,
  ViewStyle,
  View,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { appleBlue, zincColors } from "@/constants/Colors";
import { colors } from "@/styles/commonStyles";

// ─── ConfirmModal ────────────────────────────────────────────────────────────

interface ModalButton {
  text: string;
  onPress: () => void;
  style?: 'default' | 'destructive' | 'cancel';
}

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons: ModalButton[];
  onDismiss?: () => void;
}

export function ConfirmModal({ visible, title, message, buttons, onDismiss }: ConfirmModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={modalStyles.overlay}>
          <TouchableWithoutFeedback>
            <View style={modalStyles.container}>
              <Text style={modalStyles.title}>{title}</Text>
              {message ? <Text style={modalStyles.message}>{message}</Text> : null}
              <View style={modalStyles.buttons}>
                {buttons.map((btn, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      modalStyles.button,
                      btn.style === 'destructive' && modalStyles.buttonDestructive,
                      btn.style === 'cancel' && modalStyles.buttonCancel,
                    ]}
                    onPress={btn.onPress}
                  >
                    <Text
                      style={[
                        modalStyles.buttonText,
                        btn.style === 'destructive' && modalStyles.buttonTextDestructive,
                        btn.style === 'cancel' && modalStyles.buttonTextCancel,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'column',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDestructive: {
    backgroundColor: colors.error,
  },
  buttonCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDestructive: {
    color: '#FFFFFF',
  },
  buttonTextCancel: {
    color: colors.textSecondary,
  },
});

// ─── End ConfirmModal ─────────────────────────────────────────────────────────

type ButtonVariant = "filled" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  onPress,
  variant = "filled",
  size = "md",
  disabled = false,
  loading = false,
  children,
  style,
  textStyle,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const sizeStyles: Record<
    ButtonSize,
    { height: number; fontSize: number; padding: number }
  > = {
    sm: { height: 36, fontSize: 14, padding: 12 },
    md: { height: 44, fontSize: 16, padding: 16 },
    lg: { height: 55, fontSize: 18, padding: 20 },
  };

  const getVariantStyle = () => {
    const baseStyle: ViewStyle = {
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    };

    switch (variant) {
      case "filled":
        return {
          ...baseStyle,
          backgroundColor: isDark ? zincColors[50] : zincColors[900],
        };
      case "outline":
        return {
          ...baseStyle,
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: isDark ? zincColors[700] : zincColors[300],
        };
      case "ghost":
        return {
          ...baseStyle,
          backgroundColor: "transparent",
        };
    }
  };

  const getTextColor = () => {
    if (disabled) {
      return isDark ? zincColors[500] : zincColors[400];
    }

    switch (variant) {
      case "filled":
        return isDark ? zincColors[900] : zincColors[50];
      case "outline":
      case "ghost":
        return appleBlue;
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        getVariantStyle(),
        {
          height: sizeStyles[size].height,
          paddingHorizontal: sizeStyles[size].padding,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <Text
          style={StyleSheet.flatten([
            {
              fontSize: sizeStyles[size].fontSize,
              color: getTextColor(),
              textAlign: "center",
              marginBottom: 0,
              fontWeight: "700",
            },
            textStyle,
          ])}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
};

export default Button;
