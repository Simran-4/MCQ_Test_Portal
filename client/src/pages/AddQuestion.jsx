import { useState } from "react";
import axios from "axios";
import "./dashboard.css";
<img
  src="/Logo.png"
  alt="logo"
  className="page-logo"
/>

function AddQuestion() {

  const [question, setQuestion] = useState("");

  const [option1, setOption1] = useState("");

  const [option2, setOption2] = useState("");

  const [option3, setOption3] = useState("");

  const [option4, setOption4] = useState("");

  const [correctAnswer, setCorrectAnswer] = useState("");

  const [category, setCategory] = useState("");

  const handleAddQuestion = async () => {

    try {

      await axios.post(
        "https://mcqtestportal-production.up.railway.app/api/questions/add",
        {

          question,

          options: [
            option1,
            option2,
            option3,
            option4
          ],

          correctAnswer,

          category,

        }
      );

      alert("Question Added Successfully");

      setQuestion("");
      setOption1("");
      setOption2("");
      setOption3("");
      setOption4("");
      setCorrectAnswer("");
      setCategory("");

    } catch (err) {

      console.log(err);

      alert("Error Adding Question");
    }
  };

  return (

    <div className="dashboard-page">

      <div className="dashboard-card">

        <div className="dashboard-top">

          <div>

            <h1>Add Question</h1>

            <p>
              Create questions for the test portal
            </p>

          </div>

          <img
            src="/Logo.png"
            alt="logo"
            className="dashboard-logo"
          />

        </div>

        <div className="dashboard-line"></div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px"
          }}
        >

          <input
            type="text"
            placeholder="Enter Question"
            value={question}
            onChange={(e) =>
              setQuestion(e.target.value)
            }
            className="modern-input"
          />

          <input
            type="text"
            placeholder="Option 1"
            value={option1}
            onChange={(e) =>
              setOption1(e.target.value)
            }
            className="modern-input"
          />

          <input
            type="text"
            placeholder="Option 2"
            value={option2}
            onChange={(e) =>
              setOption2(e.target.value)
            }
            className="modern-input"
          />

          <input
            type="text"
            placeholder="Option 3"
            value={option3}
            onChange={(e) =>
              setOption3(e.target.value)
            }
            className="modern-input"
          />

          <input
            type="text"
            placeholder="Option 4"
            value={option4}
            onChange={(e) =>
              setOption4(e.target.value)
            }
            className="modern-input"
          />

          <input
            type="text"
            placeholder="Correct Answer"
            value={correctAnswer}
            onChange={(e) =>
              setCorrectAnswer(e.target.value)
            }
            className="modern-input"
          />

          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value)
            }
            className="modern-input"
          >

            <option value="">
              Select Category
            </option>

            <option value="Confidence">
              Confidence
            </option>

            <option value="Sociability">
              Sociability
            </option>

            <option value="Neurotic Tendency">
              Neurotic Tendency
            </option>

            <option value="Self Sufficiency">
              Self Sufficiency
            </option>

          </select>

          <button
            onClick={handleAddQuestion}
            className="dashboard-btn"
          >
            Add Question
          </button>

        </div>

      </div>

    </div>
  );
}

export default AddQuestion;