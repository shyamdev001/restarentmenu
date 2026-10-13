import { Router } from 'express';
import * as pub from '../controllers/public.controller.js';
import * as auth from '../controllers/auth.controller.js';
import * as admin from '../controllers/admin.controller.js';
import { validate, requireAdmin, publicWriteLimiter, pushLimiter, loginLimiter, uploadImage } from '../middleware/index.js';
import * as s from '../validators/schemas.js';

const router = Router();

/* ------------------------------ Customer (public) ----------------------------- */
router.get('/menu', pub.getMenu);
router.get('/orders', pub.getOrders);
router.post('/orders', publicWriteLimiter, validate(s.orderSchema), pub.placeOrder);
router.post('/calls', publicWriteLimiter, validate(s.callSchema), pub.createCall);
router.get('/tables/:table/bill', pub.tableBill);

router.get('/push/key', pub.pushKey);
router.post('/push/subscribe', pushLimiter, validate(s.pushGuestSchema), pub.pushSubscribe);
router.post('/push/unsubscribe', pushLimiter, validate(s.pushRemoveSchema), pub.pushUnsubscribe);

/* ------------------------------------ Auth ----------------------------------- */
router.post('/auth/login', loginLimiter, validate(s.loginSchema), auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', requireAdmin, auth.me);
router.put('/auth/password', requireAdmin, validate(s.passwordSchema), auth.changePassword);

/* ------------------------------------ Admin ---------------------------------- */
const a = Router();
a.use(requireAdmin);

a.get('/orders', admin.listOrders);
a.post('/orders', validate(s.staffOrderSchema), admin.createStaffOrder);
a.patch('/orders/:id', validate(s.statusSchema), admin.updateOrderStatus);
a.get('/stats', admin.getStats);
a.get('/reports', admin.report);
a.get('/reports/export', admin.reportCsv);
a.get('/history', admin.historyDays);
a.get('/history/:day', admin.historyDay);

a.get('/tables/open', admin.listOpenTables);
a.post('/tables/:table/settle', admin.settle);
a.get('/table-codes', admin.tableCodes);

a.get('/calls', admin.listCalls);
a.patch('/calls/:id', admin.resolveCall);

a.post('/categories', validate(s.categorySchema), admin.createCategory);
a.put('/categories/order', validate(s.reorderSchema), admin.reorderCategories);
a.put('/categories/:id', validate(s.categorySchema), admin.updateCategory);
a.delete('/categories/:id', admin.deleteCategory);

a.post('/dishes', validate(s.dishSchema), admin.createDish);
a.put('/dishes/:id', validate(s.dishSchema), admin.updateDish);
a.patch('/dishes/:id/availability', admin.setAvailability);
a.delete('/dishes/:id', admin.deleteDish);
a.post('/upload', uploadImage, admin.uploadDishImage);

a.post('/push/subscribe', validate(s.pushAdminSchema), admin.pushSubscribe);

a.get('/settings', admin.readSettings);
a.put('/settings', validate(s.settingsSchema), admin.updateSettings);
a.get('/qr/:table', admin.tableQr);

router.use('/admin', a);

export default router;
