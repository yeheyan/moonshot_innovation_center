// controllers/configController.js
const db = require('../db/connection');

// 获取所有配置
exports.getAllConfigs = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT config_id, config_key, config_value, config_type, description, updated_at
             FROM system_config
             ORDER BY config_key`
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get configs error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// 获取单个配置
exports.getConfig = async (req, res) => {
    try {
        const { key } = req.params;

        const result = await db.query(
            'SELECT config_value, config_type FROM system_config WHERE config_key = $1',
            [key]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Config not found'
            });
        }

        const config = result.rows[0];
        let value = config.config_value;

        // 根据类型转换值
        if (config.config_type === 'number') {
            value = parseFloat(value);
        } else if (config.config_type === 'boolean') {
            value = value === 'true';
        } else if (config.config_type === 'json') {
            value = JSON.parse(value);
        }

        res.json({
            success: true,
            data: { key, value }
        });
    } catch (error) {
        console.error('Get config error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// 更新单个配置
exports.updateConfig = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        const adminId = req.user?.userId || null;

        const result = await db.query(
            `UPDATE system_config
             SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
             WHERE config_key = $3
             RETURNING *`,
            [String(value), adminId, key]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Config not found'
            });
        }

        res.json({
            success: true,
            message: 'Config updated',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update config error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// 批量更新配置
exports.updateConfigs = async (req, res) => {
    const client = await db.pool.connect();

    try {
        const { configs } = req.body;
        const adminId = req.user?.userId || null;

        await client.query('BEGIN');

        for (const config of configs) {
            await client.query(
                `UPDATE system_config
                 SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
                 WHERE config_key = $3`,
                [String(config.value), adminId, config.key]
            );
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Configs updated'
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Update configs error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
};