import createHttpError from "http-errors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import path from "node:path";
import fs from "node:fs/promises";
import handlebars from "handlebars";
import { User } from "../models/user.js";
import { Session } from "../models/session.js";
import { createSession, setSessionCookies } from "../services/auth.js";
import { sendEmail } from "../utils/sendMail.js";

export const registerUser = async(req, res) => {
    const { email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw createHttpError(400, "Email is use");
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const newUser = await User.create({
        email,
        password: hashedPassword
    })
    const session = await createSession(newUser._id);
    setSessionCookies(res, session);

    res.status(201).json(newUser);
}

export const loginUser = async(req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
        throw createHttpError(401, 'Invalid credentials');
    }
    const isValidPassword = await bcrypt.compare(
        password,
        user.password,
    )
    if (!isValidPassword) {
        throw createHttpError(401, 'Invalid credentials');
    }
    await Session.deleteOne({ userId: user._id });
    const session = await createSession(user._id);
    setSessionCookies(res, session);

    res.status(200).json(user);
}

export const refreshUserSession = async(req, res) => {
    const { sessionId, refreshToken } = req.cookies;
    if (!sessionId || !refreshToken) {
        throw createHttpError(401, "Session not found");
    }
    const session = await Session.findOne({
        _id: sessionId,
        refreshToken,
    });

    if (!session) {
        throw createHttpError(401, 'Session not found');
    }
    const isRefreshTokenExpired = session.refreshTokenValidUntil < new Date();
    if (isRefreshTokenExpired) {
        await session.deleteOne();
        res.clearCookie("sessionId");
        res.clearCookie("accessToken");
        res.clearCookie("refreshToken");
        throw createHttpError(401, "Session token expired");
    }
    await session.deleteOne();
    const newSession = await createSession(session.userId);
    setSessionCookies(res, newSession);
    res.status(200).json({
        "message": "Session refreshed"
    });
}

export const logoutUser = async(req, res) => {
    if (req.cookies.sessionId) {
        await Session.deleteOne({ _id: req.cookies.sessionId });
    }
    res.clearCookie("sessionId");
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    res.status(204).send();
}

export const requestResetEmail = async(req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email: email });
    if (!user) {
        return res.status(200).json({ message: 'Password reset email sent successfully' });
    }

    const resetToken = jwt.sign({
        email: email,
        sub: user._id
    }, process.env.JWT_SECRET, { expiresIn: "15m" });

    const frontendUrl = `${process.env.FRONTEND_DOMAIN}/reset-password?token=${resetToken}`

    const templatePath = path.resolve('src/templates/reset-password-email.html');
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateSource);

    const html = template({
        name: user.username,
        link: `${process.env.FRONTEND_DOMAIN}/reset-password?token=${resetToken}`,
    });
    console.log("new token", resetToken);

    try {
        await sendEmail({
            from: process.env.SMTP_FROM,
            to: email,
            subject: "Password reset",
            html,
        })
    } catch (error) {
        throw createHttpError(500, 'Failed to send the email, please try again later.');
    }

    res.status(200).json({ message: 'Password reset email sent successfully' })
}

export const resetPassword = async(req, res) => {
    const { token, password } = req.body;
    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        throw createHttpError(401, 'Invalid or expired token');
    }
    const user = await User.findOne({
        _id: payload.sub,
        email: payload.email
    })
    if (!user) {
        throw createHttpError(404, 'User not found');
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await User.updateOne({ _id: user._id }, { password: hashedPassword });
    await Session.deleteMany({ userId: user._id });
    res.status(200).json({ message: 'Password reset successfully' });
}
