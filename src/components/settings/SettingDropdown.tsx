/**
 * SettingDropdown - 下拉选择设置项
 * 点击展开/收起下拉菜单，选中项高亮显示
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronDown, ChevronUp, Check } from 'react-native-feather';
import { useTheme } from '@/hooks/useTheme';
import { SettingItem, SettingItemProps } from './SettingItem';

export interface SettingDropdownProps<T extends string> extends Omit<
  SettingItemProps,
  'children' | 'onPress'
> {
  /** 选项列表 */
  options: Array<{ label: string; value: T }>;

  /** 当前选中值 */
  value: T;

  /** 值变化回调 */
  onChange: (value: T) => void;
}

export const SettingDropdown = <T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  ...rest
}: SettingDropdownProps<T>) => {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (optionValue: T) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <>
      <SettingItem disabled={disabled} onPress={() => !disabled && setIsOpen(!isOpen)} {...rest}>
        <View style={styles.dropdownValue}>
          <Text style={[styles.dropdownValueText, { color: theme.colors.textSecondary }]}>
            {selectedOption?.label ?? value}
          </Text>
          {isOpen ? (
            <ChevronUp color={theme.colors.textSecondary} width={18} height={18} />
          ) : (
            <ChevronDown color={theme.colors.textSecondary} width={18} height={18} />
          )}
        </View>
      </SettingItem>

      {isOpen && (
        <View style={[styles.dropdownMenu, { borderColor: theme.colors.divider }]}>
          {options.map((option, index) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.dropdownItem,
                index < options.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.colors.divider,
                },
              ]}
              onPress={() => handleSelect(option.value)}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  {
                    color: value === option.value ? theme.colors.primary : theme.colors.text,
                  },
                ]}
              >
                {option.label}
              </Text>
              {value === option.value && (
                <Check stroke={theme.colors.primary} width={18} height={18} strokeWidth={3} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
};

// 保持泛型函数的类型推断
export const createSettingDropdown = <T extends string>() =>
  SettingDropdown as React.FC<SettingDropdownProps<T>>;

const styles = StyleSheet.create({
  dropdownValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dropdownValueText: {
    fontSize: 16,
  },
  dropdownMenu: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemText: {
    fontSize: 16,
  },
});
