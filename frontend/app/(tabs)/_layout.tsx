import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, View } from "react-native";

import { useTheme } from "@/src/lib/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: Platform.OS === "ios" ? 88 : 68,
          paddingTop: 6,
          paddingBottom: Platform.OS === "ios" ? 28 : 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wall"
        options={{
          title: "Wall",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "flame" : "flame-outline"} size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "compass" : "compass-outline"} size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ color, focused }) => (
            <View>
              <Ionicons name={focused ? "people" : "people-outline"} size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={26} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
