import { BrowserRouter, Routes, Route } from "react-router-dom";
// import Home from "../features/home/Home";
// import Rooms from "../features/rooms/RoomList";
// import BookingForm from "../features/reservations/BookingForm";
// import Login from "../features/auth/Login";
// import Register from "../features/auth/Register";

const NotFound = () => <h2>404 - Page Not Found</h2>;

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/booking" element={<BookingForm />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
