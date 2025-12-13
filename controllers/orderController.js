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