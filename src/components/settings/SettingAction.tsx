/**
 * SettingAction - 操作按钮设置项
 * 右侧显示操作按钮
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { SettingItem, SettingItemProps } from './SettingItem';

export interface SettingActionProps extends Omit<SettingItemProps, 'children'> {
  /** 按钮文字 */
  buttonText: string;

  /** 按钮点击回调 */
  onPress: () => void;

  /** 按钮样式 */
  buttonStyle?: 'primary' | 'secondary' | 'danger';

  /** 是否显示加载状态 */
  loading?: boolean;
}

export const SettingAction: React.FC<SettingActionProps> = ({
  buttonText,
  onPress,
  buttonStyle = 'primary',
  loading = false,
  disabled = false,
  ...rest
}) => {
  const { theme } = useTheme();

  const getButtonColors = () => {
    switch (buttonStyle) {
      case 'secondary':
        return {
          background: theme.colors.surface,
          text: theme.colors.primary,
          borderColor: theme.colors.primary,
        };
      case 'danger':
        return {
          background: theme.colors.error,
          text: theme.colors.white,
          borderColor: theme.colors.error,
        };
      case 'primary':
      default:
        return {
          background: theme.colors.primary,
          text: theme.colors.white,
          borderColor: theme.colors.primary,
        };
    }
  };

  const colors = getButtonColors();

  return (
    <SettingItem disabled={disabled} {...rest}>
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: colors.background,
            borderColor: colors.borderColor,
          },
        ]}
        onPress={onPress}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <Text style={[styles.buttonText, { color: colors.text }]}>{buttonText}</Text>
        )}
      </TouchableOpacity>
    </SettingItem>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
