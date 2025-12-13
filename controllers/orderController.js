const db = require('../db/connection');

// Calculate price with discount (if provided)
exports.calculatePrice = async (req, res) => {
    try {
        const { sessionId, discountCode } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID is required'
            });
        }

        // Get session price
        const sessionResult = await db.query(
            `SELECT c.courseprice, c.coursename
       FROM session s
       JOIN course c ON s.courseid = c.courseid
       WHERE s.sessionid = $1`,
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        const originalPrice = parseFloat(sessionResult.rows[0].courseprice);
        let discountAmount = 0;
        let discountDetails = null;

        // Check discount code if provided
        if (discountCode) {
            // For now, hardcode some test discount codes
            // Later: query from discount_code table
            const validCodes = {
                'SUMMER2025': { type: 'percentage', value: 10 },  // 10% off
                'WELCOME': { type: 'fixed', value: 100 }          // ¥100 off
            };

            if (validCodes[discountCode.toUpperCase()]) {
                const discount = validCodes[discountCode.toUpperCase()];

                if (discount.type === 'percentage') {
                    discountAmount = originalPrice * (discount.value / 100);
                } else {
                    discountAmount = discount.value;
                }

                discountDetails = {
                    code: discountCode.toUpperCase(),
                    type: discount.type,
                    value: discount.value,
                    amount: discountAmount
                };
            } else {
                return res.status(400).json({
                    success: false,
                    error: '无效的优惠码'
                });
            }
        }

        const finalPrice = Math.max(0, originalPrice - discountAmount);

        res.json({
            success: true,
            data: {
                originalPrice: originalPrice,
                discountAmount: discountAmount,
                finalPrice: finalPrice,
                discountDetails: discountDetails
            }
        });

    } catch (error) {
        console.error('Calculate price error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// 获取所有待处理退款
exports.getPendingRefunds = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                r.refundid,
                r.payment_id,
                r.refund_amount,
                r.refund_reason,
                r.refund_status,
                r.created_at,
                p.orderid,
                ot.ordertotal,
                u.username,
                u.userphone,
                c.coursename,
                s.sessionname,
                st.studentname
            FROM refund r
            JOIN payment p ON r.payment_id = p.paymentid
            JOIN order_transaction ot ON p.orderid = ot.orderid
            JOIN sessionenrollment se ON ot.orderid = se.orderid
            JOIN student st ON se.studentid = st.studentid
            JOIN user_account u ON st.userid = u.userid
            JOIN session s ON se.sessionid = s.sessionid
            JOIN course c ON s.courseid = c.courseid
            WHERE r.refund_status = 'pending'
            ORDER BY r.created_at DESC
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get pending refunds error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// 处理退款（批准或拒绝）
exports.processRefund = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { refundId } = req.params;
        const { action } = req.body;  // 'approve' 或 'reject'
        const adminId = req.user?.userId || null;

        await client.query('BEGIN');

        // 获取退款信息
        const refund = await client.query(`
            SELECT r.*, p.orderid
            FROM refund r
            JOIN payment p ON r.payment_id = p.paymentid
            WHERE r.refundid = $1
        `, [refundId]);

        if (refund.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Refund not found'
            });
        }

        const refundData = refund.rows[0];

        if (action === 'approve') {
            // 更新退款记录
            await client.query(
                `UPDATE refund
                 SET refund_status = 'completed',
                     processed_by = $1,
                     wechat_refund_id = $2
                 WHERE refundid = $3`,
                [adminId, 'REFUND_' + Date.now(), refundId]
            );

            // 更新订单状态
            await client.query(
                `UPDATE order_transaction
                 SET orderstatus = 'refunded'
                 WHERE orderid = $1`,
                [refundData.orderid]
            );

        } else if (action === 'reject') {
            await client.query(
                `UPDATE refund
                 SET refund_status = 'rejected',
                     processed_by = $1
                 WHERE refundid = $2`,
                [adminId, refundId]
            );

            // 订单状态恢复为已支付
            await client.query(
                `UPDATE order_transaction
                 SET orderstatus = 'paid'
                 WHERE orderid = $1`,
                [refundData.orderid]
            );
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: action === 'approve' ? '退款已批准' : '退款已拒绝'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Process refund error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
};

// 管理员手动创建退款
exports.createManualRefund = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { orderId, reason, refundAmount } = req.body;
        const adminId = req.user?.userId || null;

        await client.query('BEGIN');

        // 获取订单和支付信息
        const order = await client.query(`
            SELECT ot.*, p.paymentid, p.payment_amount
            FROM order_transaction ot
            LEFT JOIN payment p ON ot.orderid = p.orderid
            WHERE ot.orderid = $1
        `, [orderId]);

        if (order.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        const orderData = order.rows[0];

        if (orderData.orderstatus !== 'paid' && orderData.orderstatus !== 'completed') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Order is not paid, cannot refund'
            });
        }

        const actualRefundAmount = refundAmount || orderData.payment_amount || orderData.ordertotal;

        // 创建退款记录
        if (orderData.paymentid) {
            await client.query(
                `INSERT INTO refund (payment_id, refund_amount, refund_reason, refund_status, processed_by, created_at)
                 VALUES ($1, $2, $3, 'completed', $4, CURRENT_TIMESTAMP)`,
                [orderData.paymentid, actualRefundAmount, reason || '管理员手动退款', adminId]
            );
        }

        // 更新订单状态
        await client.query(
            `UPDATE order_transaction
             SET orderstatus = 'refunded'
             WHERE orderid = $1`,
            [orderId]
        );

        // 更新报名状态
        await client.query(
            `UPDATE sessionenrollment
             SET enrollmentstatus = 'withdrawn'
             WHERE orderid = $1`,
            [orderId]
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            message: '退款成功',
            data: { refundAmount: actualRefundAmount }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create manual refund error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
};