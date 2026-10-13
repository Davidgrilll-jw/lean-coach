// Starter food database. Values are per 100 g of the edible portion and are
// APPROXIMATE (rounded from typical food-composition tables such as USDA
// FoodData Central and Thai food composition data). Brands, cuts and cooking
// methods vary, so every item can be edited in the app.
//
// state: 'raw' = weighed uncooked, 'cooked' = weighed after cooking, 'na' = not applicable.
// Row: [id, name, category, state, kcal, protein, carb, fat, servings, favorite]

export const FOOD_CATEGORIES = {
  carb: 'ข้าว/แป้ง',
  protein: 'เนื้อสัตว์/ไข่',
  dairy: 'นม/โปรตีนเสริม',
  veg: 'ผัก',
  fruit: 'ผลไม้',
  fat: 'น้ำมัน/ถั่ว',
  sauce: 'ซอส/น้ำตาล',
  drink: 'เครื่องดื่ม',
  snack: 'ของกินเล่น',
  dish: 'อาหารจานเดียว',
};

export const FOOD_STATES = { raw: 'ดิบ', cooked: 'สุก', na: '' };

const tbsp = (g) => [['ช้อนโต๊ะ', g], ['ช้อนชา', Math.round((g / 3) * 10) / 10]];

const ROWS = [
  // ข้าว/แป้ง
  ['rice_white_cooked', 'ข้าวสวย (ข้าวขาวหุงสุก)', 'carb', 'cooked', 130, 2.7, 28.2, 0.3, [['ทัพพี', 60], ['ถ้วย', 150]], true],
  ['rice_white_raw', 'ข้าวสารขาว', 'carb', 'raw', 360, 7, 79, 0.6, [['ถ้วยตวง', 185]]],
  ['rice_brown_cooked', 'ข้าวกล้องหุงสุก', 'carb', 'cooked', 123, 2.7, 25.6, 1, [['ทัพพี', 60]]],
  ['rice_sticky_cooked', 'ข้าวเหนียวนึ่ง', 'carb', 'cooked', 229, 4.6, 50.5, 0.6, [['ห่อเล็ก', 100]]],
  ['bread_wholewheat', 'ขนมปังโฮลวีต', 'carb', 'na', 250, 12, 43, 3.5, [['แผ่น', 30]]],
  ['bread_white', 'ขนมปังขาว', 'carb', 'na', 265, 9, 49, 3.2, [['แผ่น', 25]]],
  ['oats_raw', 'ข้าวโอ๊ต', 'carb', 'raw', 380, 13, 67, 7, [['ช้อนโต๊ะ', 10]]],
  ['sweet_potato_cooked', 'มันเทศต้ม/นึ่ง', 'carb', 'cooked', 76, 1.4, 17.7, 0.1, [['หัวกลาง', 130]]],
  ['potato_cooked', 'มันฝรั่งต้ม', 'carb', 'cooked', 87, 1.9, 20, 0.1, [['หัวกลาง', 150]]],
  ['rice_noodle_cooked', 'เส้นก๋วยเตี๋ยวลวก', 'carb', 'cooked', 109, 1.8, 24, 0.2, [['ก้อน', 120]]],
  ['egg_noodle_cooked', 'บะหมี่ไข่ลวก', 'carb', 'cooked', 138, 4.5, 25, 2.1, [['ก้อน', 100]]],
  ['pasta_cooked', 'เส้นสปาเกตตีต้ม', 'carb', 'cooked', 158, 5.8, 31, 0.9, [['ถ้วย', 140]]],
  // เนื้อสัตว์/ไข่
  ['chicken_breast_raw', 'อกไก่ไม่ติดหนัง', 'protein', 'raw', 120, 22.5, 0, 2.6, [['ชิ้น', 150]]],
  ['chicken_breast_cooked', 'อกไก่ไม่ติดหนัง (ต้ม/ย่าง)', 'protein', 'cooked', 165, 31, 0, 3.6, [['ชิ้น', 120]], true],
  ['chicken_thigh_raw', 'สะโพกไก่ไม่ติดหนัง', 'protein', 'raw', 121, 19.7, 0, 4.1, []],
  ['chicken_thigh_cooked', 'สะโพกไก่ไม่ติดหนัง (สุก)', 'protein', 'cooked', 179, 24.8, 0, 8.2, []],
  ['pork_tenderloin_raw', 'หมูสันใน', 'protein', 'raw', 120, 21, 0, 3.5, []],
  ['pork_tenderloin_cooked', 'หมูสันใน (สุก)', 'protein', 'cooked', 143, 26, 0, 3.5, [], true],
  ['pork_loin_raw', 'หมูสันนอก', 'protein', 'raw', 143, 21.4, 0, 5.7, []],
  ['pork_mince_raw', 'หมูสับ (ติดมันทั่วไป)', 'protein', 'raw', 263, 16.9, 0, 21.2, []],
  ['pork_mince_cooked', 'หมูสับ (สุก)', 'protein', 'cooked', 297, 25.7, 0, 20.8, []],
  ['pork_belly_raw', 'หมูสามชั้น', 'protein', 'raw', 518, 9.3, 0, 53, []],
  ['beef_lean_raw', 'เนื้อวัวไม่ติดมัน', 'protein', 'raw', 130, 21.5, 0, 4.5, []],
  ['beef_lean_cooked', 'เนื้อวัวไม่ติดมัน (สุก)', 'protein', 'cooked', 190, 29, 0, 7.5, []],
  ['mackerel_steamed', 'ปลาทูนึ่ง', 'protein', 'cooked', 136, 24.9, 0, 4, [['ตัว (เนื้อ)', 60]]],
  ['tilapia_raw', 'ปลานิล', 'protein', 'raw', 96, 20.1, 0, 1.7, []],
  ['tilapia_cooked', 'ปลานิล (สุก)', 'protein', 'cooked', 128, 26.2, 0, 2.7, []],
  ['salmon_raw', 'ปลาแซลมอน', 'protein', 'raw', 208, 20.4, 0, 13.4, []],
  ['dory_raw', 'ปลาดอลลี่', 'protein', 'raw', 90, 15, 0, 3, []],
  ['shrimp_cooked', 'กุ้ง (สุก)', 'protein', 'cooked', 99, 24, 0.2, 0.3, []],
  ['tuna_canned_water', 'ทูน่ากระป๋องในน้ำแร่ (สะเด็ดน้ำ)', 'protein', 'na', 116, 25.5, 0, 0.8, [['กระป๋อง', 130]]],
  ['egg_boiled', 'ไข่ต้ม', 'protein', 'cooked', 155, 12.6, 1.1, 10.6, [['ฟอง', 50]], true],
  ['egg_raw', 'ไข่ไก่ทั้งฟอง', 'protein', 'raw', 143, 12.6, 0.7, 9.5, [['ฟอง', 50]]],
  ['egg_white', 'ไข่ขาว', 'protein', 'na', 52, 10.9, 0.7, 0.2, [['ฟอง', 33]]],
  ['egg_fried', 'ไข่ดาว (ทอดน้ำมัน)', 'protein', 'cooked', 196, 13.6, 0.8, 15, [['ฟอง', 46]]],
  ['egg_omelette', 'ไข่เจียว (ทอดน้ำมัน)', 'protein', 'cooked', 280, 12, 1, 25, [['ไข่ 1 ฟอง', 60]]],
  ['tofu_firm', 'เต้าหู้ขาวแข็ง', 'protein', 'na', 100, 10.5, 2.5, 5.5, [['ก้อน', 150]]],
  // นม/โปรตีนเสริม
  ['whey', 'เวย์โปรตีน (ผง)', 'dairy', 'na', 400, 80, 8, 6, [['สกู๊ป', 30]]],
  ['milk_whole', 'นมจืด', 'dairy', 'na', 64, 3.3, 4.8, 3.5, [['แก้ว', 200]]],
  ['milk_lowfat', 'นมพร่องมันเนย', 'dairy', 'na', 46, 3.4, 5, 1.5, [['แก้ว', 200]]],
  ['milk_skim', 'นมขาดมันเนย', 'dairy', 'na', 35, 3.4, 5, 0.1, [['แก้ว', 200]]],
  ['greek_yogurt_0', 'กรีกโยเกิร์ตไขมัน 0% รสธรรมชาติ', 'dairy', 'na', 59, 10, 3.6, 0.4, [['ถ้วย', 150]]],
  ['yogurt_plain', 'โยเกิร์ตรสธรรมชาติ', 'dairy', 'na', 61, 3.5, 4.7, 3.3, [['ถ้วย', 135]]],
  ['soy_milk_unsweet', 'นมถั่วเหลืองไม่หวาน', 'dairy', 'na', 40, 3.3, 1.8, 2, [['แก้ว', 250]]],
  // ผัก
  ['veg_green_cooked', 'ผักใบเขียวลวก/ต้ม (คะน้า ผักบุ้ง)', 'veg', 'cooked', 25, 2.5, 4, 0.3, [['ทัพพี', 50]], true],
  ['broccoli_cooked', 'บรอกโคลีต้ม', 'veg', 'cooked', 35, 2.4, 7.2, 0.4, [['ถ้วย', 90]]],
  ['cabbage', 'กะหล่ำปลี', 'veg', 'raw', 25, 1.3, 5.8, 0.1, []],
  ['cucumber', 'แตงกวา', 'veg', 'raw', 15, 0.7, 3.6, 0.1, [['ลูก', 60]]],
  ['tomato', 'มะเขือเทศ', 'veg', 'raw', 18, 0.9, 3.9, 0.2, [['ลูก', 80]]],
  ['carrot', 'แครอท', 'veg', 'raw', 41, 0.9, 9.6, 0.2, []],
  ['salad_mix', 'ผักสลัดรวม', 'veg', 'raw', 17, 1.3, 3.2, 0.2, [['ถ้วย', 50]]],
  // ผลไม้
  ['banana', 'กล้วยหอม', 'fruit', 'na', 89, 1.1, 22.8, 0.3, [['ลูก', 100]]],
  ['apple', 'แอปเปิล', 'fruit', 'na', 52, 0.3, 13.8, 0.2, [['ลูก', 150]]],
  ['orange', 'ส้ม', 'fruit', 'na', 47, 0.9, 11.8, 0.1, [['ลูก', 100]]],
  ['watermelon', 'แตงโม', 'fruit', 'na', 30, 0.6, 7.6, 0.2, [['ชิ้น', 150]]],
  ['mango_ripe', 'มะม่วงสุก', 'fruit', 'na', 60, 0.8, 15, 0.4, [['ซีก', 120]]],
  ['guava', 'ฝรั่ง', 'fruit', 'na', 68, 2.6, 14.3, 1, [['ครึ่งลูก', 150]]],
  ['pineapple', 'สับปะรด', 'fruit', 'na', 50, 0.5, 13.1, 0.1, [['ชิ้น', 80]]],
  // น้ำมัน/ถั่ว
  ['oil', 'น้ำมันพืช (ทุกชนิด)', 'fat', 'na', 884, 0, 0, 100, [['ช้อนโต๊ะ', 13.5], ['ช้อนชา', 4.5]], true],
  ['butter', 'เนย', 'fat', 'na', 717, 0.9, 0.1, 81, [['ช้อนชา', 5]]],
  ['peanut_roasted', 'ถั่วลิสงคั่ว', 'fat', 'na', 585, 23.7, 21.5, 49.7, [['กำมือ', 30]]],
  ['almond', 'อัลมอนด์', 'fat', 'na', 579, 21.2, 21.6, 49.9, [['กำมือ', 28]]],
  ['peanut_butter', 'เนยถั่ว', 'fat', 'na', 588, 25, 20, 50, [['ช้อนโต๊ะ', 16]]],
  ['avocado', 'อะโวคาโด', 'fat', 'na', 160, 2, 8.5, 14.7, [['ครึ่งลูก', 70]]],
  ['coconut_milk', 'กะทิ', 'fat', 'na', 197, 2.2, 2.8, 21.3, tbsp(15)],
  // ซอส/น้ำตาล
  ['fish_sauce', 'น้ำปลา', 'sauce', 'na', 35, 5, 3.6, 0, tbsp(18)],
  ['soy_sauce', 'ซีอิ๊วขาว', 'sauce', 'na', 53, 8, 4.9, 0.6, tbsp(16)],
  ['oyster_sauce', 'ซอสหอยนางรม', 'sauce', 'na', 120, 2, 27, 0.3, tbsp(18)],
  ['ketchup', 'ซอสมะเขือเทศ', 'sauce', 'na', 101, 1, 27, 0.1, tbsp(17)],
  ['chili_sauce', 'ซอสพริก', 'sauce', 'na', 93, 1, 21, 0.5, tbsp(17)],
  ['sweet_chili', 'น้ำจิ้มไก่', 'sauce', 'na', 190, 0.3, 46, 0.2, tbsp(18)],
  ['mayonnaise', 'มายองเนส', 'sauce', 'na', 680, 1, 0.6, 75, tbsp(14)],
  ['salad_cream', 'น้ำสลัดครีม', 'sauce', 'na', 450, 1, 10, 45, tbsp(15)],
  ['sugar', 'น้ำตาลทราย', 'sauce', 'na', 387, 0, 100, 0, [['ช้อนชา', 4], ['ช้อนโต๊ะ', 12]]],
  ['honey', 'น้ำผึ้ง', 'sauce', 'na', 304, 0.3, 82, 0, tbsp(21)],
  // เครื่องดื่ม
  ['coffee_black', 'กาแฟดำไม่ใส่น้ำตาล', 'drink', 'na', 1, 0.1, 0, 0, [['แก้ว', 240]]],
  ['latte_iced', 'ลาเต้เย็น (หวานปกติ)', 'drink', 'na', 60, 2, 9, 2, [['แก้ว', 360]]],
  ['thai_tea', 'ชาไทยเย็น', 'drink', 'na', 75, 1, 13, 2, [['แก้ว', 400]]],
  ['bubble_tea', 'ชานมไข่มุก', 'drink', 'na', 72, 0.6, 14, 1.6, [['แก้ว', 500]]],
  ['soda', 'น้ำอัดลม', 'drink', 'na', 42, 0, 10.6, 0, [['กระป๋อง', 325]]],
  ['soda_zero', 'น้ำอัดลมไม่มีน้ำตาล', 'drink', 'na', 0, 0, 0, 0, [['กระป๋อง', 325]]],
  ['orange_juice', 'น้ำส้มคั้น', 'drink', 'na', 45, 0.7, 10.4, 0.2, [['แก้ว', 240]]],
  ['sports_drink', 'เครื่องดื่มเกลือแร่', 'drink', 'na', 26, 0, 6.4, 0, [['ขวด', 250]]],
  ['beer', 'เบียร์', 'drink', 'na', 43, 0.5, 3.6, 0, [['กระป๋อง', 330]]],
  // ของกินเล่น
  ['chips', 'มันฝรั่งทอดกรอบ', 'snack', 'na', 536, 7, 53, 35, [['ซองเล็ก', 30]]],
  ['chocolate_milk', 'ช็อกโกแลตนม', 'snack', 'na', 535, 7.6, 59, 30, [['แท่งเล็ก', 40]]],
  ['ice_cream', 'ไอศกรีมวานิลลา', 'snack', 'na', 207, 3.5, 23.6, 11, [['สกู๊ป', 65]]],
  ['cookie', 'คุกกี้', 'snack', 'na', 480, 5, 65, 22, [['ชิ้น', 12]]],
  // อาหารจานเดียว (แปรผันสูงตามร้านและปริมาณน้ำมัน)
  ['dish_krapao', 'ข้าวกะเพราหมูสับ (ไม่รวมไข่ดาว)', 'dish', 'cooked', 165, 7, 19, 6.5, [['จาน', 350]]],
  ['dish_chicken_rice', 'ข้าวมันไก่', 'dish', 'cooked', 200, 8, 24, 8, [['จาน', 300]]],
  ['dish_fried_rice', 'ข้าวผัดหมู', 'dish', 'cooked', 160, 6, 22, 5.3, [['จาน', 350]]],
  ['dish_pad_thai', 'ผัดไทย', 'dish', 'cooked', 183, 7, 24, 6.5, [['จาน', 300]]],
  ['dish_noodle_soup', 'ก๋วยเตี๋ยวน้ำใสหมู', 'dish', 'cooked', 73, 4.5, 10, 1.7, [['ชาม', 450]]],
  ['dish_somtam', 'ส้มตำไทย', 'dish', 'cooked', 60, 1.5, 11, 1.2, [['จาน', 200]]],
  ['dish_grilled_chicken', 'ไก่ย่าง (ติดหนัง)', 'dish', 'cooked', 220, 24, 1, 13, [['ชิ้น', 100]]],
  ['dish_moo_ping', 'หมูปิ้ง', 'dish', 'cooked', 250, 17, 10, 16, [['ไม้', 35]]],
  ['dish_tom_yum', 'ต้มยำกุ้งน้ำใส', 'dish', 'cooked', 35, 4, 2, 1.2, [['ถ้วย', 250]]],
  ['dish_green_curry', 'แกงเขียวหวานไก่', 'dish', 'cooked', 120, 7, 4, 8.5, [['ถ้วย', 200]]],
];

export const DEFAULT_FOODS = ROWS.map(([id, name, category, state, kcal, p, c, f, servings, favorite]) => ({
  id,
  name,
  category,
  state,
  kcal,
  p,
  c,
  f,
  servings: (servings || []).map(([label, grams]) => ({ label, grams })),
  favorite: !!favorite,
  custom: false,
  source: 'ค่าประมาณจากฐานข้อมูลเริ่มต้น',
}));
