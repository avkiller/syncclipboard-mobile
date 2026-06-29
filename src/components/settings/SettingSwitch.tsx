/**
 * SettingSwitch - 开关设置项
 * 封装 Switch 控件，提供统一的样式配置
 */

import React from 'react';
import { Switch } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { SettingItem, SettingItemProps } from './SettingItem';

export interface SettingSwitchProps extends Omit<SettingItemProps, 'children'> {
  /** 开关当前值 */
  value: boolean;

  /** 值变化回调 */
  onChange: (value: boolean) => void;
}

export const SettingSwitch: React.FC<SettingSwitchProps> = ({
  value,
  onChange,
  disabled = false,
  ...rest
}) => {
  const { theme } = useTheme();

  return (
    <SettingItem disabled={disabled} {...rest}>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.divider, true: theme.colors.primary }}
        thumbColor={value ? theme.colors.surface : theme.colors.textTertiary}
        disabled={disabled}
      />
    </SettingItem>
  );
};
