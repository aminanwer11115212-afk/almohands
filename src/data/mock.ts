export type Product = {
  id: string;
  name: string;
  qty: number;
  price: number;
  category: string;
};

export const products: Product[] = [
  { id: "1", name: "عمود كونة 2016 عالي", qty: 46, price: 270000, category: "محرك" },
  { id: "2", name: "مشط دركسون 2016 عالي", qty: 48, price: 650000, category: "دركسون" },
  { id: "3", name: "باكم فرامل 2016 عالي تايون", qty: 48, price: 160000, category: "فرامل" },
  { id: "4", name: "ج مرايات 2016 واطي", qty: 26999, price: 270000, category: "اكسسوار" },
  { id: "5", name: "مساعدات امامية لانسر", qty: 46, price: 240000, category: "مساعدات" },
  { id: "6", name: "باكم فرامل 2006 لينك", qty: 3, price: 85000, category: "فرامل" },
  { id: "7", name: "ماستر 3Y", qty: 47, price: 110000, category: "محرك" },
  { id: "8", name: "باكم عجب عالي", qty: 45, price: 30000, category: "تعليق" },
  { id: "9", name: "باكم عجل واطي", qty: 45, price: 30000, category: "تعليق" },
  { id: "10", name: "لقم فرامل 2006 واطي", qty: 45, price: 30000, category: "فرامل" },
  { id: "11", name: "بلي 2014 عالي ابو حساس", qty: 45, price: 100000, category: "تعليق" },
  { id: "12", name: "فلتر هواء كورولا 2018", qty: 22, price: 45000, category: "فلاتر" },
  { id: "13", name: "زيت محرك 5W30 ٤ لتر", qty: 80, price: 90000, category: "زيوت" },
  { id: "14", name: "بطارية 70 امبير", qty: 12, price: 380000, category: "كهرباء" },
];

export const accountSummary = {
  today: 0,
  yesterday: 0,
  thisMonth: 17775000,
  lastMonth: 33340000,
  yearToDate: 215600000,
  profit: {
    today: 0,
    yesterday: 0,
    thisMonth: 4250000,
    lastMonth: 8980000,
  },
};
