
const User=require('../models/User')
async function user_entry_lookup_on_login(userData){
// const userData = await userdata.json();

// if (!userdata.ok) {
//     return res.status(userdata.status).json(userData);
// }


// STEP 5: Find user in YOUR database
    try    {
    let user = await User.findOne({
        googleId: userData.id
    });


    // If user does not exist, create them

    if (!user) {
        user = await User.create({
            googleId: userData.id,
            name: userData.name,
            email: userData.email,
            profilePicture: userData.picture
        });
    }

    console.log("Logged in user:", user);
    }
    catch(e){
        console.log("error from making a user:", e.message)
    }
}

module.exports={user_entry_lookup_on_login};