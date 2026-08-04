const CATEGORY_MAP: { keywords: string[]; category: string; expenseType: string }[] = [
  { keywords: ['grocery', 'groceries', 'supermarket', 'vegetables', 'veggies'], category: 'Grocery', expenseType: 'Food & Dining' },
  { keywords: ['lunch', 'dinner', 'breakfast', 'snack', 'coffee', 'restaurant', 'food'], category: 'Food', expenseType: 'Food & Dining' },
  { keywords: ['fuel', 'petrol', 'diesel'], category: 'Fuel', expenseType: 'Transport' },
  { keywords: ['taxi', 'uber', 'ola', 'cab', 'bus', 'train', 'metro', 'parking'], category: 'Transit', expenseType: 'Transport' },
  { keywords: ['rent'], category: 'Rent', expenseType: 'Housing' },
  { keywords: ['electricity', 'water bill', 'internet', 'wifi', 'phone bill', 'mobile bill', 'utility', 'utilities'], category: 'Utilities', expenseType: 'Housing' },
  { keywords: ['medicine', 'doctor', 'pharmacy', 'hospital', 'health'], category: 'Health', expenseType: 'Health' },
  { keywords: ['movie', 'entertainment', 'games', 'netflix', 'subscription'], category: 'Entertainment', expenseType: 'Lifestyle' },
  { keywords: ['shopping', 'clothes', 'amazon'], category: 'Shopping', expenseType: 'Lifestyle' },
];

export function classify(rawCategoryText: string): { category: string; expenseType: string } {
  const text = (rawCategoryText || '').trim().toLowerCase();
  for (const rule of CATEGORY_MAP) {
    if (rule.keywords.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(text))) {
      return { category: rule.category, expenseType: rule.expenseType };
    }
  }
  const titleCased = (rawCategoryText || 'Other').trim().replace(/\b\w/g, (c) => c.toUpperCase());
  return { category: titleCased || 'Other', expenseType: 'Other' };
}
