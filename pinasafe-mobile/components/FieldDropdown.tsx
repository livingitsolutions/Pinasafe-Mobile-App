import React from "react";
import { Dropdown } from "react-native-element-dropdown";

export type DropdownOption = {
  [key: string]: any; // allows any structure
};

type ReusableDropdownProps = {
  data: DropdownOption[];
  value: any;
  onChange: (value: any) => void;
  labelField?: string;
  valueField?: string;
  placeholder?: string;
  style?: object;
};

export default function ReusableDropdown({
  data,
  value,
  onChange,
  labelField = "label",
  valueField = "value",
  placeholder = "Select an option",
  style = {},
}: ReusableDropdownProps) {
  return (
    <Dropdown
      style={{
        height: 50,
        borderColor: "#ccc",
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        ...style,
      }}
      placeholder={placeholder}
      data={data}
      labelField={labelField}
      valueField={valueField}
      value={value}
      onChange={(item) => onChange(item[valueField])}
    />
  );
}
