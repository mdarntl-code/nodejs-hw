import createHttpError from "http-errors";
import bcrypt from "bcrypt";
import { User } from "../models/user.js";
import { Session } from "../models/session.js";
import { createSession, setSessionCookies } from "../services/auth.js";

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

    res.status(200).json(newUser);
}
