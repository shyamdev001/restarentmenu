// First-run sample data. Everything here can be changed from the admin panel.
export const categories = [
  ['starters', 'Starters'],
  ['curries', 'Curries'],
  ['dosa', 'Dosa & Tiffin'],
  ['rice', 'Rice & Biryani'],
  ['desserts', 'Desserts']
];

export const addons = {
  starters: [['Extra chutney trio', 40], ['Masala chai', 90]],
  curries: [['Butter naan', 90], ['Jeera rice', 160]],
  dosa: [['Extra sambar', 60], ['Filter coffee', 110]],
  rice: [['Burani raita', 90], ['Mirchi ka salan', 120]],
  desserts: [['Vanilla bean ice cream', 120], ['Saffron milk', 140]]
};

// id, category, veg, word, name, accent, description, price, minutes, colour, image, ingredients, allergens, kcal, protein, spice, chef note
export const rows = [
  ['r1', 'rice', 0, 'BIRYANI', 'Dum Gosht', 'Biryani', 'Lamb and aged basmati sealed in a brass handi, slow-cooked on embers with saffron.', 560, 35, '#A53E0B', 'hero', ['Lamb shoulder', 'Aged basmati', 'Saffron', 'Fried onion', 'Mint'], 'Dairy', 780, 38, 2, 'The seal is only broken at your table, so the first breath of saffron is yours.'],
  ['c2', 'curries', 0, 'MASALA', 'Chicken Tikka', 'Masala', 'Charred tikka folded into a smoked tomato and cream gravy, finished with fenugreek.', 520, 25, '#8A1717', 'tikka', ['Chicken thigh', 'Tomato', 'Cream', 'Kasuri methi', 'Ginger'], 'Dairy', 610, 36, 2, 'We char the tikka harder than most. That bitterness is what balances the cream.'],
  ['o2', 'dosa', 1, 'UTTAPAM', 'Podi', 'Uttapam', 'A thick, soft rice pancake off the iron griddle, dusted with gunpowder spice and ghee.', 260, 15, '#5A4A0C', 'uttapam', ['Rice batter', 'Urad dal', 'Podi spice', 'Ghee', 'Curry leaf'], 'Dairy, sesame', 340, 9, 2, 'Fermented for eighteen hours, which is where the sour edge comes from.'],
  ['r4', 'rice', 0, 'PRAWN', 'Prawn', 'Pulao', 'Tiger prawns over tomato rice, cooked in their own stock with curry leaf.', 620, 30, '#0F4E57', 'prawn', ['Tiger prawn', 'Basmati', 'Tomato', 'Curry leaf', 'Coconut oil'], 'Shellfish', 640, 32, 1, 'The rice is cooked in stock made from the prawn shells. Nothing is wasted.'],
  ['c1', 'curries', 0, 'MAKHANI', 'Old Delhi', 'Butter Chicken', 'Tandoor-roasted chicken in a slow tomato gravy with white butter and a little smoke.', 540, 25, '#87490A', 'butter', ['Chicken', 'Tomato', 'White butter', 'Cashew', 'Honey'], 'Dairy, tree nuts', 690, 34, 1, 'An Old Delhi recipe, finished with a spoon of cold butter at the pass.'],
  ['s1', 'starters', 1, 'SAMOSA', 'Punjabi', 'Samosa', 'Hand-folded pastry, spiced potato and peas, with mint and tamarind chutneys.', 240, 12, '#23325F', 'samosa', ['Potato', 'Green pea', 'Cumin', 'Pastry', 'Tamarind'], 'Gluten', 310, 6, 1, 'Folded by hand every afternoon. No two are quite the same shape.'],
  ['t1', 'desserts', 1, 'COCOA', 'Dark Chocolate', 'Cake', 'Single-origin cocoa, baked dense and dark, crowned with a fresh raspberry.', 320, 10, '#46182F', 'cake', ['Dark cocoa', 'Butter', 'Egg', 'Raspberry', 'Sea salt'], 'Dairy, egg, gluten', 450, 7, 0, 'Baked a little under, so the centre stays close to fudge.'],
  ['o1', 'dosa', 1, 'DOSA', 'Masala Dosa', 'Roll', 'A crisp dosa rolled around potato masala, served with a cool hung curd dip.', 320, 15, '#1D3B2A', 'roll', ['Rice batter', 'Potato', 'Mustard seed', 'Hung curd', 'Coriander'], 'Dairy', 420, 10, 1, 'A masala dosa you can eat with one hand.'],
  ['s2', 'starters', 0, 'KEEMA', 'Keema', 'Samosa', 'Minced lamb with green chilli and mint in blistered, crisp pastry.', 320, 12, '#5C2A12', 'keema', ['Lamb mince', 'Green chilli', 'Mint', 'Pastry', 'Garam masala'], 'Gluten', 380, 16, 2, 'The pastry is rolled thin so it blisters in the oil.'],
  ['r2', 'rice', 0, 'DUM', 'Hyderabadi', 'Chicken Biryani', 'Kacchi style: raw marinated chicken and rice cooked together, with burani raita.', 480, 35, '#7A2E0C', 'biryani', ['Chicken', 'Basmati', 'Yoghurt', 'Saffron', 'Fried onion'], 'Dairy', 720, 40, 3, 'Raw meat and rice go into the pot together. Timing is everything.'],
  ['c3', 'curries', 0, 'HERB', 'Makhani &', 'Herb Rice', 'Chicken makhani plated beside coriander rice. A complete plate for one.', 460, 20, '#6B3A10', 'thali', ['Chicken', 'Tomato', 'Butter', 'Basmati', 'Coriander'], 'Dairy', 650, 35, 1, 'Our answer for anyone eating alone: one plate, nothing missing.'],
  ['s3', 'starters', 1, 'GHEE', 'Ghee Roast', 'Dosa', 'Paper-thin and golden, roasted in ghee, with fresh coconut chutney.', 280, 12, '#3B2A5C', 'dosa', ['Rice batter', 'Urad dal', 'Ghee', 'Coconut', 'Green chilli'], 'Dairy', 290, 7, 1, 'Spread thin enough to read through, then roasted until it crackles.'],
  ['o3', 'dosa', 1, 'APPAM', 'Lace', 'Appam', 'Fermented rice hoppers with lacy edges and a soft centre, with coconut stew.', 300, 18, '#2B3440', 'appam', ['Rice', 'Coconut milk', 'Yeast', 'Sugar', 'Salt'], 'None of the major allergens', 260, 5, 0, 'Crisp at the edge and soft as a pillow in the middle.'],
  ['r3', 'rice', 0, 'SMOKE', 'Smoked Chilli', 'Skillet Rice', 'Tossed in cast iron with burnt garlic and sesame, brought to the table still hissing.', 340, 15, '#164F3C', 'rice', ['Basmati', 'Garlic', 'Dried chilli', 'Sesame', 'Spring onion'], 'Sesame, soy', 480, 14, 3, 'Carried out in the skillet it was cooked in. Mind the handle.'],
  ['r5', 'rice', 0, 'SESAME', 'Sesame Chilli', 'Chicken Bowl', 'Glazed chicken, peppers and broccoli over grain rice, finished with toasted sesame.', 420, 18, '#1F4A1F', 'bowl', ['Chicken', 'Bell pepper', 'Broccoli', 'Sesame', 'Soy glaze'], 'Sesame, soy', 560, 37, 2, 'The lightest plate on the menu, and one of the most ordered.'],
  ['t3', 'desserts', 1, 'BERRY', 'Berry', 'Charlotte', 'Sponge fingers around light cream, piled with frozen berries.', 380, 10, '#6A1838', 'charlotte', ['Sponge fingers', 'Cream', 'Strawberry', 'Blueberry', 'Vanilla'], 'Dairy, egg, gluten', 410, 6, 0, 'Assembled to order so the sponge keeps its bite.'],
  ['t2', 'desserts', 1, 'PETITS', 'Petits', 'Gâteaux', 'Three small layered cakes with winter spice and berries.', 360, 10, '#3A1F4A', 'petit', ['Sponge', 'Cream', 'Cinnamon', 'Berries', 'Icing sugar'], 'Dairy, egg, gluten', 390, 5, 0, 'Three small cakes, made to be shared. They rarely are.']
];

export const settings = {
  name: 'Saffron & Smoke',
  tagline: 'Modern Indian Grill',
  welcome: 'Plates from the charcoal grill, the clay oven and the slow pot.',
  currency: '₹',
  taxPercent: 5,
  tables: 12,
  publicUrl: ''
};
