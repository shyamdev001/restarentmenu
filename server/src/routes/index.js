import { Router } from 'express';
import * as pub from '../controllers/public.controller.js';
import * as auth from '../controllers/auth.controller.js';
import * as admin from '../controllers/admin.controller.js';
import { validate, requireAdmin, allow, publicWriteLimiter, pushLimiter, loginLimiter, uploadImage } from '../middleware/index.js';
import * as s from '../validators/schemas.js';

const router = Router();

/* ------------------------------ Customer (public) ----------------------------- */
router.get('/menu', pub.getMenu);
router.get('/orders', pub.getOrders);
router.post('/orders', publicWriteLimiter, validate(s.orderSchema), pub.placeOrder);
router.post('/calls', publicWriteLimiter, validate(s.callSchema), pub.createCall);
router.get('/tables/:table/bill', pub.tableBill);
router.post('/orders/:id/spin', publicWriteLimiter, pub.spinWheel);
router.post('/orders/:id/rating', publicWriteLimiter, validate(s.ratingSchema), pub.rateOrder);

router.get('/push/key', pub.pushKey);
router.post('/push/subscribe', pushLimiter, validate(s.pushGuestSchema), pub.pushSubscribe);
router.post('/push/unsubscribe', pushLimiter, validate(s.pushRemoveSchema), pub.pushUnsubscribe);
router.post('/push/renew', pushLimiter, validate(s.pushRenewSchema), pub.pushRenew);

router.post('/club/join', publicWriteLimiter, validate(s.clubJoinSchema), pub.clubJoin);
router.get('/club/card', pub.clubCard);
router.post('/club/push', pushLimiter, validate(s.clubPushSchema), pub.clubPush);
router.post('/club/leave', publicWriteLimiter, validate(s.clubKeySchema), pub.clubLeave);

/* ------------------------------------ Auth ----------------------------------- */
router.post('/auth/login', loginLimiter, validate(s.loginSchema), auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', requireAdmin, auth.me);
router.put('/auth/password', requireAdmin, validate(s.passwordSchema), auth.changePassword);

/* ------------------------------------ Admin ---------------------------------- */
const a = Router();
a.use(requireAdmin);

a.get('/orders', allow('orders'), admin.listOrders);
a.post('/orders', allow('enter'), validate(s.staffOrderSchema), admin.createStaffOrder);
a.patch('/orders/:id', allow('orders'), validate(s.statusSchema), admin.updateOrderStatus);
a.patch('/orders/:id/items', allow('cancel'), validate(s.trimSchema), admin.trimOrderItems);
a.get('/stats', allow('orders'), admin.getStats);
a.get('/reports', allow('reports'), admin.report);
a.get('/reports/export', allow('reports'), admin.reportCsv);
a.get('/history', allow('reports'), admin.historyDays);
a.get('/history/:day', allow('reports'), admin.historyDay);

a.get('/tables/open', allow('orders'), admin.listOpenTables);
a.post('/tables/:table/settle', allow('settle'), validate(s.settleSchema), admin.settle);
a.get('/tables/:table/bill', allow('settle'), admin.tableBillForStaff);
a.post('/tables/:table/move', allow('settle'), validate(s.moveSchema), admin.moveToTable);
a.get('/table-codes', allow('qr'), admin.tableCodes);

a.get('/calls', allow('orders'), admin.listCalls);
a.patch('/calls/:id', allow('calls'), admin.resolveCall);

a.post('/categories', allow('menu'), validate(s.categorySchema), admin.createCategory);
a.put('/categories/order', allow('menu'), validate(s.reorderSchema), admin.reorderCategories);
a.put('/categories/:id', allow('menu'), validate(s.categorySchema), admin.updateCategory);
a.delete('/categories/:id', allow('menu'), admin.deleteCategory);

a.post('/dishes', allow('menu'), validate(s.dishSchema), admin.createDish);
a.put('/dishes/:id', allow('menu'), validate(s.dishSchema), admin.updateDish);
a.patch('/dishes/:id/availability', allow('soldout'), admin.setAvailability);
a.delete('/dishes/:id', allow('menu'), admin.deleteDish);
a.post('/upload', allow('menu'), uploadImage, admin.uploadDishImage);

a.post('/push/subscribe', validate(s.pushAdminSchema), admin.pushSubscribe);

a.get('/settings', admin.readSettings);
a.put('/settings/game', allow('settings'), validate(s.gameSchema), admin.updateGame);
a.put('/settings', allow('settings'), validate(s.settingsSchema), admin.updateSettings);
a.get('/qr/:table', allow('qr'), admin.tableQr);

a.get('/guests', allow('guests'), admin.guestList);
a.get('/guests/export', allow('guests'), admin.guestCsv);
a.post('/guests/offer', allow('guests'), validate(s.offerSchema), admin.guestOffer);
a.post('/guests/:id/redeem', allow('settle'), admin.guestRedeem);
a.delete('/guests/:id', allow('guests'), admin.guestRemove);
a.put('/settings/club', allow('settings'), validate(s.clubSettingsSchema), admin.updateClub);

a.get('/staff', allow('staff'), admin.staffList);
a.post('/staff', allow('staff'), validate(s.staffAddSchema), admin.staffAdd);
a.put('/staff/:id', allow('staff'), validate(s.staffChangeSchema), admin.staffChange);
a.delete('/staff/:id', allow('staff'), admin.staffRemove);

router.use('/admin', a);

export default router;
