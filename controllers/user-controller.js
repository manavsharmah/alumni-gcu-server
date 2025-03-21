const User = require('../model/User');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { validationResult } = require("express-validator");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AlumniRecord = require('../model/AlumniRecord');
const sharp = require('sharp');




const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, phone, batch, branch, roll_no, password } = req.body;

  const currentYear = new Date().getFullYear();
  if (batch < 2006 || batch > currentYear + 4) {
    return res.status(400).json({ error: 'Batch must be a valid year between 2006 and ' + (currentYear + 4) });
  }

  try {
    const existingUser = await User.findOne({
      $or: [
        { email },
        { roll_no, batch, branch }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with the provided email or alumni details is already registered' });
    }

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      phone,
      batch,
      branch,
      roll_no,
      password: hashedPassword, // Save hashed password
      isVerified: false // Set to false initially
    });

    const alumniMatch = await AlumniRecord.findOne({
      name,
      roll_no,
      batch,
      branch
    });

    if (alumniMatch) {
      user.isVerified = true; // Auto-approve if matched
      console.log('User auto-approved:', user);
    }

    await user.save();

    // Send registration confirmation email
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      auth: {
        user: process.env.EMAIL_ADD,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: 'process.env.EMAIL_ADD',
      to: user.email,
      subject: 'Registration Confirmation',
      text: user.isVerified ?
        `Dear ${user.name},\n\nThank you for registering with us. Your account has been automatically verified based on our records. You can now log in to your account.\n\nBest regards,\nGCU Alumni Association` :
        `Dear ${user.name},\n\nThank you for registering with us. Your registration is successful, and it is pending verification. We will notify you once your account is approved.\n\nBest regards,\nGCU Alumni Association`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Error sending registration email:', error.message);
        // Don't fail the entire registration if email fails to send
        return console.error('Failed to send email:', error.message);
      }
      console.log('Confirmation email sent:', info.messageId);
      console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    });

    const message = user.isVerified ? 'Registration successful, user auto-approved.' : 'Registration successful, pending admin approval.';
    res.status(201).json({ message });

  } catch (error) {
    console.error('Registration process error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getUser = async (req, res) =>{
  try{
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: 'User not found'})
    }
    res.json(user);
    } catch(error) {
      res.status(500).json({ error: 'Server error' });
      }
};

const updateProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { biography, currentWorkingPlace, socialLinks,  address, designation, achievements } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.biography = biography || user.biography;
    user.currentWorkingPlace = currentWorkingPlace || user.currentWorkingPlace;
    user.address = address || user.address;
    user.designation = designation || user.designation;
    user.achievements = achievements || user.achievements;
    user.socialLinks = {
      linkedin: socialLinks.linkedin || user.socialLinks.linkedin,
      facebook: socialLinks.facebook || user.socialLinks.facebook
    };

    await user.save();
    res.json({ message: 'Profile updated successfully', user });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const reset_password = async (req, res) => {
  const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, oldPassword, newPassword } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid current password' });
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();
        
      res.json({ message: 'Password reset successful' });
    } catch (error) {
        console.error('Password reset error:', error);      
        res.status(500).json({ error: 'Server error' });
    }
};

const getUserById = async (req, res) => {
  try {
    // Find user by ID from request params and exclude password
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const recommendUsers = async (req, res) => {
  try {
    const loggedInUser = await User.findById(req.user.id); // Fetch logged-in user

    if (!loggedInUser) {
      return res.status(404).json({ message: 'Logged in user not found' });
    }

    // Fetch users from the same batch or branch, excluding the logged-in user
    const recommendedUsers = await User.find({
      _id: { $ne: loggedInUser._id },
      isVerified: true, 
      role: 'user',
      $or: [
        { batch: loggedInUser.batch },  // Recommend batchmates
        { branch: loggedInUser.branch } // Recommend branchmates
      ]
    }).limit(10).select('name branch batch');

    res.json(recommendedUsers);
  } catch (error) {
    console.error('Error fetching recommended users:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getVerifiedUsers = async (req, res) => {
  const { search } = req.query; // Get search term from query parameters

  try {
    const query = {
      _id: { $ne: req.user.id },
      isVerified: true,
      role: 'user',
    };

    if (search) {
      const searchRegex = new RegExp(search, 'i'); // Case-insensitive regex for string fields

      // Add conditions for name and branch (strings)
      query.$or = [
        { name: { $regex: searchRegex } },
        { branch: { $regex: searchRegex } },
      ];

      // If the search is a valid number, add it to the batch filter
      const searchNumber = parseInt(search, 10);
      if (!isNaN(searchNumber)) {
        query.$or.push({ batch: searchNumber });
      }
    }

    const users = await User.find(query).select('name branch batch');
    res.json(users);
  } catch (error) {
    console.error('Error fetching verified users:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const dummyPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(dummyPassword, 10);

    user.password = hashedPassword;
    await User.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword } },
      { runValidators: false }  //no more validation of the other fields but only password
    );

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      auth: {
        user: process.env.EMAIL_ADD,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_ADD,
      to: user.email,
      subject: 'Password Reset',
      text: `Your new temporary password is: ${dummyPassword}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Error sending email:', error.message);
        return res.status(500).json({ error: 'Failed to send reset email' });
      }
      console.log('Email sent:', info.messageId);
      console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
      res.json({ message: 'Password reset email sent' });
    });
  } catch (error) {
    console.error('Forgot Password process error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


const checkEmail = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (user) {
      return res.json({ available: false });
    }
    return res.json({ available: true });
  } catch (error) {
    console.error('Error checking email availability:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};


const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png/;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    return cb(null, false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter
});

const uploadProfilePhoto = async (req, res) => {
  try {
    // Check if a file was provided
    if (!req.file) {
      // Differentiate between no file selected and invalid file type
      if (req.fileValidationError) {
        return res.status(400).json({ message: req.fileValidationError });
      } else {
        return res.status(400).json({ message: 'No file selected. Please choose a file to upload.' });
      }
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate filename
    const userId = req.user.id;
    const timestamp = Date.now();
    const originalname = path.basename(req.file.originalname);
    const sanitizedName = originalname.replace(/\s+/g, '_'); // Replace spaces with underscores
    const filename = `${userId}-${timestamp}-${sanitizedName}`;
    const uploadPath = path.join('uploads/profilephotos/', filename);
    const fullUploadPath = path.join(__dirname, '..', uploadPath);

    // Delete old profile photo if exists in MongoDB
    if (user.profilePhoto && user.profilePhoto !== null) {
      const oldPhotoPath = path.join(__dirname, '..', user.profilePhoto);
      console.log('Old profile photo path:', oldPhotoPath); // Log for debugging
      
      try {
        await fs.promises.unlink(oldPhotoPath); // Using fs.promises.unlink instead of fs.unlink
        console.log(`Deleted old profile photo: ${oldPhotoPath}`);
      } catch (error) {
        console.error('Error deleting old profile photo:', error);
        // Continue with the upload even if delete fails
      }
    }

    // Process the image using Sharp
    await sharp(req.file.buffer)
      .resize(350, 350, {  
        fit: 'cover',
        withoutEnlargement: true
      })
      .jpeg({ 
        quality: 50,  
        chromaSubsampling: '4:4:4',  
        force: true  
      })
      .toFile(fullUploadPath);

    // Update user's profile photo path
    user.profilePhoto = uploadPath;
    await user.save();

    res.json({ message: 'Profile photo uploaded successfully', photoPath: user.profilePhoto });
  } catch (error) {
    console.error('Profile photo upload error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};


const removeProfilePhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the user has a profile photo to delete
    if (user.profilePhoto) {
      const oldPhotoPath = path.join(__dirname, '..', user.profilePhoto);

      try {
        await fs.promises.unlink(oldPhotoPath); // Delete the old photo file
        console.log(`Deleted old profile photo: ${oldPhotoPath}`);
      } catch (error) {
        console.error('Error deleting profile photo:', error);
        return res.status(500).json({ message: 'Error deleting the profile photo' });
      }

      // Remove the photo path reference from the database
      user.profilePhoto = null;
      await user.save();

      return res.json({ message: 'Profile photo deleted successfully' });
    } else {
      return res.status(400).json({ message: 'No profile photo to delete' });
    }
  } catch (error) {
    console.error('Error removing profile photo:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};


const getProfilePhotoById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('profilePhoto');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.profilePhoto) {
      return res.json({ profilePhoto: null, message: "User does not have a profile photo set" });
    }
    res.json({ profilePhoto: user.profilePhoto });
  } catch (err) {
    console.error('Error fetching profile photo:', err);
    res.status(500).json({ message: "Unable to fetch profile photo", error: err.message });
  }
};


module.exports = {
    reset_password,
    register,
    getUser,
    updateProfile,
    getVerifiedUsers,
    forgotPassword, 
    checkEmail,
    getUserById,
    recommendUsers, 
    upload, 
    uploadProfilePhoto,
    getProfilePhotoById,
    removeProfilePhoto
}
