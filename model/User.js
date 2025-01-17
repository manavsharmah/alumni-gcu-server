const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    minlength: [2, 'Name must be at least 2 characters long']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address']
  },
  phone: { 
    type: String, 
    required: function() { return this.role !== 'admin'; }, // Required only for non-admins
    match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number']
  },
  password: { 
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long']
  },
  roll_no: {
    type: Number,
    required: function() { return this.role !== 'admin'; }, // Required only for non-admins
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value'
    }
  },
  batch: {
    type: Number,
    required: function() { return this.role !== 'admin'; }, // Required only for non-admins
    validate: {
      validator: function(value) {
        const currentYear = new Date().getFullYear();
        return value >= 2006 && value <= currentYear + 4;
      },
      message: props => `${props.value} is not a valid year!`
    }
  },
  branch: {
    type: String,
    required: function() { return this.role !== 'admin'; } // Required only for non-admins
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  role: {
    type: String, 
    enum: ['user', 'admin'],
    default: 'user'   
  },
  biography: {
    type: String,
    maxlength: [500, 'Biography cannot exceed 500 characters']
  },
  currentWorkingPlace: {
    type: String,
  },
  address: {
    type: String,
  },
  designation: {
    type: String,
  },
  achievements: {
    type: [String],  // Array of achievements as strings
  },
  socialLinks: {
    linkedin: { 
      type: String,
      match: [/^https?:\/\/(www\.)?linkedin\.com\/.*$/, 'Please enter a valid LinkedIn URL']
    },
    facebook: { 
      type: String,
      match: [/^https?:\/\/(www\.)?facebook\.com\/.*$/, 'Please enter a valid Facebook URL']
    }
  },
  profilePhoto: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
