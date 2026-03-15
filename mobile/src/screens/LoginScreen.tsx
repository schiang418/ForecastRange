import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, spacing, fontSize } from '../config/theme';
import { useAuthStore } from '../store/authStore';

export default function LoginScreen() {
  const { login, loading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const handleAppleLogin = async () => {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        await login('apple', credential.identityToken, {
          givenName: credential.fullName?.givenName ?? undefined,
          familyName: credential.fullName?.familyName ?? undefined,
        });
      }
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') return;
      console.error('Apple login failed:', error);
      const serverMsg = error?.response?.data?.error;
      setError(serverMsg || error.message || 'Login failed. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ForecastRange</Text>
        <Text style={styles.subtitle}>Stock Price Range Forecasting</Text>
        <Text style={styles.description}>
          IV-powered forecasts for options premium sellers
        </Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.buttons}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.accent} />
        ) : (
          <>
            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={12}
                style={styles.appleButton}
                onPress={handleAppleLogin}
              />
            )}

            <Pressable style={styles.googleButton} onPress={() => {
              // TODO: Implement Google Sign-In with expo-auth-session
              console.log('Google sign-in not yet configured');
            }}>
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(255, 80, 80, 0.15)',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: '#ff5050',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  buttons: {
    gap: spacing.md,
    alignItems: 'center',
  },
  appleButton: {
    width: '100%',
    height: 50,
  },
  googleButton: {
    width: '100%',
    height: 50,
    backgroundColor: colors.white,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#333',
  },
});
