import { ChevronDown, Search, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface Option {
  label: string;
  value: string;
  subtitle?: string;
  zipCode?: string;
}

interface AutocompleteInputProps {
  label: string;
  placeholder: string;
  options: Option[];
  value: string;
  onSelect: (value: string, label: string, option?: Option) => void;
  searchable?: boolean;
  disabled?: boolean;
  required?: boolean;
}

export default function AutocompleteInput({
  label,
  placeholder,
  options,
  value,
  onSelect,
  searchable = true,
  disabled = false,
  required = false,
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredOptions, setFilteredOptions] = useState(options);

  useEffect(() => {
    if (searchable && searchQuery) {
      const filtered = options.filter(option =>
        option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        option.subtitle?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredOptions(filtered);
    } else {
      setFilteredOptions(options);
    }
  }, [searchQuery, options, searchable]);

  const selectedOption = options.find(option => option.value === value);
  const displayText = selectedOption ? selectedOption.label : value;

  const handleSelect = (option: Option) => {
    onSelect(option.value, option.label, option);
    setIsOpen(false);
    setSearchQuery('');
  };

  const clearSelection = () => {
    onSelect('', '');
    setSearchQuery('');
  };

  return (
    <View>
      <Text className="text-gray-700 font-medium mb-2">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>
      
      <TouchableOpacity
        onPress={() => !disabled && setIsOpen(true)}
        className={`flex-row items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        <Text className={`flex-1 ${displayText ? 'text-gray-900' : 'text-gray-500'}`}>
          {displayText || placeholder}
        </Text>
        <View className="flex-row items-center">
          {value && !disabled && (
            <TouchableOpacity onPress={clearSelection} className="mr-2">
              <X size={16} color="#6B7280" strokeWidth={1.5} />
            </TouchableOpacity>
          )}
          <ChevronDown size={20} color="#6B7280" strokeWidth={1.5} />
        </View>
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsOpen(false)}
      >
        <View className="flex-1 bg-white">
          {/* Header */}
          <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
            <Text className="text-lg font-semibold text-gray-900">Select {label}</Text>
            <TouchableOpacity onPress={() => setIsOpen(false)}>
              <X size={24} color="#6B7280" strokeWidth={1.5} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          {searchable && (
            <View className="p-4 border-b border-gray-100">
              <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                <Search size={20} color="#6B7280" strokeWidth={1.5} />
                <TextInput
                  className="flex-1 ml-3 text-gray-900"
                  placeholder={`Search ${label.toLowerCase()}...`}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                />
              </View>
            </View>
          )}

          {/* Options List */}
          <ScrollView className="flex-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => handleSelect(option)}
                  className={`p-4 border-b border-gray-100 ${
                    option.value === value ? 'bg-blue-50' : ''
                  }`}
                >
                  <Text className={`font-medium ${
                    option.value === value ? 'text-blue-600' : 'text-gray-900'
                  }`}>
                    {option.label}
                  </Text>
                  {option.subtitle && (
                    <Text className="text-gray-500 text-sm mt-1">{option.subtitle}</Text>
                  )}
                </TouchableOpacity>
              ))
            ) : (
              <View className="p-8 items-center">
                <Text className="text-gray-500">No options found</Text>
                {searchQuery && (
                  <Text className="text-gray-400 text-sm mt-1">
                    Try adjusting your search
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}