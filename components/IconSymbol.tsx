import React from "react";
import { OpaqueColorValue, StyleProp, TextStyle, ViewStyle, Text } from "react-native";

const iconMap: { [key: string]: string } = {
  "calendar-today": "📅",
  "check-circle": "✅",
  "schedule": "🕐",
  "event-available": "📋",
  "add-circle": "➕",
  "person-add": "👤",
  "list": "📝",
  "refresh": "🔄",
  "warning": "⚠️",
  "arrow-forward": "›",
  "settings": "⚙️",
  "person": "👤",
  "bar-chart": "📊",
  "home": "🏠",
  "edit": "✏️",
  "delete": "🗑️",
  "phone": "📞",
  "email": "📧",
  "close": "✕",
  "check": "✓",
  "add": "＋",
  "search": "🔍",
  "notifications": "🔔",
  "logout": "🚪",
  "business": "🏢",
  "whatsapp": "💬",
  "star": "⭐",
  "info": "ℹ️",
  "error": "❌",
  "visibility": "👁",
  "visibility-off": "🙈",
};

export function IconSymbol({
  android_material_icon_name,
  size = 24,
  color,
  style,
  onPress,
}: {
  ios_icon_name?: string;
  android_material_icon_name: string;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: any;
  onPress?: any;
  onClick?: any;
  onMouseOver?: any;
  onMouseLeave?: any;
  testID?: any;
  accessibilityLabel?: any;
}) {
  const emoji = iconMap[android_material_icon_name] || "•";
  
  return (
    <Text
      onPress={onPress}
      style={[{ fontSize: size * 0.8, color: color as string, textAlign: 'center' }, style as any]}
    >
      {emoji}
    </Text>
  );
}
