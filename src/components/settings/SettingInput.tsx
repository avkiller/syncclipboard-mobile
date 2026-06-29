/**
 * SettingInput - 输入框设置项
 * 带单位的输入框，支持输入过滤和失焦保存
 */

import React from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardTypeOptions } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { SettingItem, SettingItemProps } from './SettingItem';

export interface SettingInputProps extends Omit<SettingItemProps, 'children'> {
  /** 输入框当前值 */
  value: string;

  /** 值变化回调 */
  onChangeText: (text: string) => void;

  /** 失焦回调，通常用于保存 */
  onBlur?: () => void;

  /** 单位文字，如 "MB"、"秒" */
  unit?: string;

  /** 键盘类型 */
  keyboardType?: KeyboardTypeOptions;

  /** 占位文字 */
  placeholder?: string;

  /** 输入过滤函数，如只允许数字 */
  filter?: (text: string) => string;
}

export const SettingInput: React.FC<SettingInputProps> = ({
  value,
  onChangeText,
  onBlur,
  unit,
  keyboardType = 'default',
  placeholder,
  filter,
  disabled = false,
  ...rest
}) => {
  const { theme } = useTheme();

  const handleChangeText = (text: string) => {
    const filteredText = filter ? filter(text) : text;
    onChangeText(filteredText);
  };

  return (
    <SettingItem disabled={disabled} {...rest}>
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.input,
            {
              color: disabled ? theme.colors.textTertiary : theme.colors.text,
              borderColor: theme.colors.divider,
              backgroundColor: theme.colors.background,
            },
          ]}
          value={value}
          onChangeText={handleChangeText}
          onBlur={onBlur}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          editable={!disabled}
        />
        {unit && (
          <Text style={[styles.unitLabel, { color: theme.colors.textSecondary }]}>{unit}</Text>
        )}
      </View>
    </SettingItem>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    width: 80,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'right',
    textAlignVertical: 'center',
  },
  unitLabel: {
    fontSize: 16,
    marginLeft: 8,
    fontWeight: '500',
  },
});
